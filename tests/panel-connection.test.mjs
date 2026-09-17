import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

function event() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    emit: (value) => {
      for (const fn of listeners) fn(value);
    },
  };
}

// A small deterministic hook driver, not a DOM/React reconciliation substitute.
// Browser integration still exercises the actual React production bundles.
function setup() {
  const slots = [],
    effects = [],
    timers = new Map(),
    ports = [];
  let cursor = 0,
    nextId = 0,
    dirty = false,
    value;
  const setTimer = (fn, delay, interval = false) => {
    const id = ++nextId;
    timers.set(id, { fn, delay, interval });
    return id;
  };
  const clock = {
    setTimeout: (fn, delay) => setTimer(fn, delay),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => setTimer(fn, delay, true),
    clearInterval: (id) => timers.delete(id),
  };
  const visibility = new Set();
  const document = {
    hidden: false,
    addEventListener: (_, fn) => visibility.add(fn),
    removeEventListener: (_, fn) => visibility.delete(fn),
  };
  const directoryRef = { current: { retained: true } };
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (next) => {
          const result = typeof next === "function" ? next(slots[i]) : next;
          if (!Object.is(slots[i], result)) {
            slots[i] = result;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useEffect(fn, deps) {
      const i = cursor++,
        old = slots[i];
      if (!old || deps.some((d, index) => !Object.is(d, old.deps[index]))) {
        effects.push(() => {
          old?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const { usePanelConnection } = loadTypeScript(
    new URL("../apps/extension/lib/use-panel-connection.ts", import.meta.url),
    {
      window: clock,
      ...clock,
      document,
      crypto: { randomUUID: () => `request-${++nextId}` },
      chrome: {
        runtime: {
          connect: ({ name }) => {
            assert.equal(name, "ui-helper-panel");
            const port = {
              onMessage: event(),
              onDisconnect: event(),
              sent: [],
              postMessage(message) {
                this.sent.push(message);
              },
              disconnect() {
                this.onDisconnect.emit();
              },
            };
            ports.push(port);
            return port;
          },
        },
        windows: { getCurrent: async () => ({ id: 7 }) },
      },
    },
    {
      react,
      "./panel-files": {
        saveGifToDirectory: async () => ".ui-helper/recordings/test.gif",
      },
    },
  );
  function render() {
    do {
      dirty = false;
      cursor = 0;
      value = usePanelConnection(directoryRef);
      while (effects.length) effects.shift()();
    } while (dirty);
    return value;
  }
  function fire(delay) {
    const entry = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `expected ${delay}ms timer`);
    const [id, timer] = entry;
    if (!timer.interval) timers.delete(id);
    timer.fn();
    render();
  }
  function unmount() {
    for (const slot of slots) slot?.cleanup?.();
  }
  render();
  return {
    render,
    fire,
    unmount,
    timers,
    ports,
    directoryRef,
    document,
    visibility,
    get current() {
      return value;
    },
    get port() {
      return ports.at(-1);
    },
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("panel handshake, tab filtering, heartbeat and correlated command result", async () => {
  const env = setup();
  try {
    await tick();
    assert.deepEqual(plain(env.port.sent[0]), {
      type: "PANEL_HELLO",
      windowId: 7,
      visible: true,
    });
    assert.equal((await env.current.command({ type: "preview" })).ok, false);
    env.port.onMessage.emit({ type: "PANEL_LOADING", tabId: 11 });
    env.port.onMessage.emit({
      type: "PANEL_STATE",
      tabId: 22,
      state: { secret: true },
    });
    assert.equal(env.render().state, null);
    const state = { mode: "inspect" };
    env.port.onMessage.emit({ type: "PANEL_STATE", tabId: 11, state });
    assert.equal(env.render().state, state);
    const response = env.current.command({ type: "preview" });
    const sent = env.port.sent.at(-1);
    assert.equal(sent.tabId, 11);
    env.port.onMessage.emit({
      type: "PANEL_RESULT",
      id: sent.id,
      result: { ok: true },
    });
    assert.deepEqual(await response, { ok: true });
    assert.ok(![...env.timers.values()].some((t) => t.delay === 120_000));
    env.fire(20_000);
    assert.equal(env.port.sent.at(-1).type, "PANEL_PING");
    env.document.hidden = true;
    for (const fn of env.visibility) fn();
    assert.deepEqual(plain(env.port.sent.at(-1)), {
      type: "PANEL_VISIBLE",
      visible: false,
    });
  } finally {
    env.unmount();
  }
  assert.equal(env.timers.size, 0);
  assert.equal(env.visibility.size, 0);
});

test("pending commands time out, ignore late replies, and fail on disconnect/unmount", async () => {
  const env = setup();
  env.port.onMessage.emit({ type: "PANEL_LOADING", tabId: 11 });
  const timed = env.current.command({ type: "export" });
  const oldId = env.port.sent.at(-1).id;
  env.fire(120_000);
  assert.equal((await timed).error, "Page response timed out");
  env.port.onMessage.emit({
    type: "PANEL_RESULT",
    id: oldId,
    result: { ok: true },
  });
  const disconnected = env.current.command({ type: "preview" });
  env.port.disconnect();
  assert.equal(
    (await disconnected).error,
    "Sidebar disconnected. Reopen UI Helper.",
  );
  env.fire(250);
  env.port.onMessage.emit({ type: "PANEL_LOADING", tabId: 11 });
  const pending = env.current.command({ type: "preview" });
  env.unmount();
  assert.equal((await pending).ok, false);
  assert.equal(env.timers.size, 0);
});

test("three bounded reconnects preserve the directory; Retry resets the budget", () => {
  const env = setup();
  const directory = env.directoryRef.current;
  try {
    for (const delay of [250, 500, 1000]) {
      env.port.disconnect();
      env.fire(delay);
    }
    assert.equal(env.ports.length, 4);
    env.port.disconnect();
    assert.equal(
      env.render().error,
      "Connection lost. Click Retry connection to reconnect.",
    );
    assert.equal(env.directoryRef.current, directory);
    env.current.retryConnection();
    env.render();
    assert.equal(env.ports.length, 5);
    env.port.disconnect();
    env.fire(250);
    assert.equal(env.ports.length, 6);
  } finally {
    env.unmount();
  }
});

test("initial watchdog and file results retain their current errors and payloads", async () => {
  const env = setup();
  try {
    env.fire(6000);
    assert.match(env.current.error, /Connection timed out/);
    env.port.onMessage.emit({
      type: "PANEL_SAVE_GIF",
      id: "file",
      dataUrl: "data:",
      filename: "test.gif",
    });
    await tick();
    assert.deepEqual(plain(env.port.sent.find((m) => m.id === "file")), {
      type: "PANEL_FILE_RESULT",
      id: "file",
      result: { ok: true, relativePath: ".ui-helper/recordings/test.gif" },
    });
    env.directoryRef.current = null;
    env.port.onMessage.emit({
      type: "PANEL_SAVE_GIF",
      id: "missing",
      dataUrl: "data:",
      filename: "test.gif",
    });
    await tick();
    assert.equal(
      env.port.sent.find((m) => m.id === "missing").result.error,
      "Error: Choose a project folder before recording",
    );
  } finally {
    env.unmount();
  }
});
