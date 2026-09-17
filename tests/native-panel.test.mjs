import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { connectPage } from "../apps/extension/lib/connect-page.ts";

const source = await readFile(
  new URL("../apps/extension/entrypoints/background.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
test("handshake retries React readiness without relying on PANEL_READY", async () => {
  let probes = 0,
    injections = 0;
  const state = { mode: "idle" };
  const result = await connectPage({
    send: async () => (++probes >= 4 ? { ok: true, state } : undefined),
    inject: async () => {
      injections++;
    },
    current: () => true,
    timeoutMs: 200,
    retryMs: 1,
  });
  assert.equal(result, state);
  assert.equal(injections, 1);
  assert.equal(probes, 4);
});
test("missing receiver and stuck injection terminate instead of Connecting forever", async () => {
  await assert.rejects(
    connectPage({
      send: async () => undefined,
      inject: async () => {},
      current: () => true,
      timeoutMs: 20,
      retryMs: 1,
    }),
    /did not respond/,
  );
  await assert.rejects(
    connectPage({
      send: async () => undefined,
      inject: () => new Promise(() => {}),
      current: () => true,
      timeoutMs: 20,
      retryMs: 1,
    }),
    /initialization timed out/,
  );
});
test("cancelled connection never injects into a no-longer-selected tab", async () => {
  let injected = false;
  await assert.rejects(
    connectPage({
      send: async () => undefined,
      inject: async () => {
        injected = true;
      },
      current: () => false,
    }),
    /cancelled/,
  );
  assert.equal(injected, false);
});

function event() {
  const listeners = [];
  return {
    addListener(fn) {
      listeners.push(fn);
    },
    emit(...args) {
      return listeners.map((fn) => fn(...args));
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
function setup() {
  const sent = [],
    opened = [],
    posted = [],
    injected = [];
  const chrome = {
    action: { onClicked: event() },
    sidePanel: {
      open: (options) => {
        opened.push(options);
        return Promise.resolve();
      },
    },
    tabs: {
      onActivated: event(),
      onUpdated: event(),
      query: async () => [{ id: 11 }],
      sendMessage: async (tabId, message) => {
        sent.push({ tabId, ...message });
        return { ok: true, state: { mode: "idle" } };
      },
    },
    scripting: {
      executeScript: async (options) => {
        injected.push(options);
      },
    },
    runtime: { onConnect: event(), onMessage: event() },
  };
  vm.runInNewContext(js, {
    chrome,
    exports: {},
    require: () => ({ connectPage }),
    defineBackground: (fn) => fn(),
    crypto,
    setTimeout,
    clearTimeout,
  });
  const port = {
    name: "ui-helper-panel",
    sender: {},
    onMessage: event(),
    onDisconnect: event(),
    postMessage: (message) => posted.push(message),
  };
  chrome.runtime.onConnect.emit(port);
  port.onMessage.emit({ type: "PANEL_HELLO", windowId: 1 });
  return { chrome, port, sent, opened, posted, injected };
}

test("action opens native panel synchronously; active page attaches", async () => {
  const env = setup();
  env.chrome.action.onClicked.emit({ id: 11, windowId: 1 });
  assert.equal(env.opened[0].windowId, 1);
  await settle();
  assert.ok(
    env.sent.some((item) => item.type === "PANEL_ATTACH" && item.tabId === 11),
  );
  assert.ok(env.posted.some((item) => item.type === "PANEL_STATE"));
  env.port.onDisconnect.emit();
});

test("tab switch rejects stale commands and ignores unrelated page state", async () => {
  const env = setup();
  await settle();
  env.posted.length = 0;
  env.chrome.runtime.onMessage.emit(
    { type: "PANEL_STATE", state: { secret: true } },
    { tab: { id: 22 }, frameId: 0 },
    () => {},
  );
  assert.equal(env.posted.length, 0);
  env.chrome.tabs.onActivated.emit({ tabId: 22, windowId: 1 });
  await settle();
  assert.ok(
    env.sent.some(
      (item) =>
        item.type === "PANEL_VISIBILITY" && item.tabId === 11 && !item.active,
    ),
  );
  env.port.onMessage.emit({
    type: "PANEL_COMMAND",
    tabId: 11,
    id: "stale",
    command: { type: "delete", id: "note" },
  });
  const response = env.posted.find((item) => item.id === "stale");
  assert.equal(response.result.ok, false);
  assert.ok(!env.sent.some((item) => item.type === "PANEL_COMMAND"));
  env.port.onMessage.emit({
    type: "PANEL_COMMAND",
    tabId: 22,
    id: "current",
    command: { type: "preview" },
  });
  await settle();
  assert.ok(
    env.sent.some((item) => item.type === "PANEL_COMMAND" && item.tabId === 22),
  );
  env.port.onDisconnect.emit();
  assert.ok(
    env.sent.some(
      (item) =>
        item.type === "PANEL_VISIBILITY" && item.tabId === 22 && !item.active,
    ),
  );
});

test("missing content script is injected; restricted page reports reconnect guidance", async () => {
  const env = setup();
  await settle();
  env.chrome.tabs.sendMessage = async () => {
    throw new Error("No receiver");
  };
  env.chrome.tabs.onActivated.emit({ tabId: 33, windowId: 1 });
  await settle();
  assert.equal(env.injected.at(-1).target.tabId, 33);
  env.chrome.scripting.executeScript = async () => {
    throw new Error("Cannot access");
  };
  env.chrome.tabs.onActivated.emit({ tabId: 44, windowId: 1 });
  await settle();
  assert.equal(env.posted.at(-1).type, "PANEL_ERROR");
  env.port.onDisconnect.emit();
});

test("hidden panels do not inject or activate newly selected pages", async () => {
  const env = setup();
  await settle();
  env.port.onMessage.emit({ type: "PANEL_VISIBLE", visible: false });
  env.sent.length = 0;
  env.chrome.tabs.onActivated.emit({ tabId: 55, windowId: 1 });
  await settle();
  assert.ok(!env.sent.some((item) => item.type === "PANEL_ATTACH"));
  assert.equal(env.injected.length, 0);
  env.chrome.tabs.query = async () => [{ id: 55 }];
  env.port.onMessage.emit({ type: "PANEL_VISIBLE", visible: true });
  await settle();
  assert.ok(
    env.sent.some((item) => item.type === "PANEL_ATTACH" && item.tabId === 55),
  );
  env.port.onDisconnect.emit();
});

test("file requests stay on their owning port and fail cleanly on close", async () => {
  const env = setup();
  await settle();
  let result;
  env.chrome.runtime.onMessage.emit(
    {
      type: "PANEL_SAVE_GIF",
      dataUrl: "data:image/gif;base64,",
      filename: "test.gif",
    },
    { tab: { id: 11 }, frameId: 0 },
    (value) => {
      result = value;
    },
  );
  const request = env.posted.at(-1);
  assert.equal(request.type, "PANEL_SAVE_GIF");
  env.port.onMessage.emit({
    type: "PANEL_FILE_RESULT",
    id: request.id,
    result: { ok: true, relativePath: ".ui-helper/recordings/test.gif" },
  });
  assert.equal(result.ok, true);
  env.chrome.runtime.onMessage.emit(
    { type: "PANEL_SAVE_GIF", filename: "next.gif" },
    { tab: { id: 11 }, frameId: 0 },
    (value) => {
      result = value;
    },
  );
  env.port.onDisconnect.emit();
  assert.equal(result.ok, false);
});
