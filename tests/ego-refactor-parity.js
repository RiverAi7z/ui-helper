// Production bundles, two real documents, MOCK Chrome transport/capture/files.
// Start sidepanel-harness.mjs; set uiHelperTestSpace with p1 (page), p2 (panel).
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const panel = task.page("p2");
const assert = (await import("node:assert/strict")).default;
const session = crypto.randomUUID();
await page.goto(`http://127.0.0.1:5186/?session=${session}`);
await panel.goto(`http://127.0.0.1:5186/sidepanel.html?session=${session}`);
await panel.waitForSelector('button[title="Inspect elements"]');
await panel.click('button[title="Inspect elements"]');

const bounds = () =>
  page.evaluate(() => {
    const element = document.querySelector("#theme-button");
    const r = element.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      style: element.style.cssText,
      neighbors: [...element.parentElement.children]
        .filter(
          (e) => e !== element && !e.matches("[data-ui-helper-placeholder]"),
        )
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
    };
  });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1, `${a} != ${b}`);
for (const handle of ["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
  await page.click("#theme-button");
  await panel.waitForSelector('button[title="Save annotation"]');
  const before = await bounds();
  const point = await page.evaluate((handle) => {
    window.refactorTarget = document.querySelector("#theme-button");
    const root = document.querySelector("ui-helper-root").shadowRoot;
    const r = root
      .querySelector(
        handle === "move" ? ".ui-element-transform" : `.ui-transform-${handle}`,
      )
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, handle);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y + 10, { steps: 6 });
  await page.mouse.up();
  const after = await bounds();
  if (handle === "move") {
    near(after.x, before.x + 12);
    near(after.y, before.y + 10);
  } else {
    near(
      after.width,
      before.width +
        (handle.includes("e") ? 12 : handle.includes("w") ? -12 : 0),
    );
    near(
      after.height,
      before.height +
        (handle.includes("s") ? 10 : handle.includes("n") ? -10 : 0),
    );
  }
  assert.equal(after.neighbors.length, before.neighbors.length);
  after.neighbors.forEach((r, i) =>
    Object.keys(r).forEach((key) => near(r[key], before.neighbors[i][key])),
  );
  assert.equal(
    await page.evaluate(
      () => window.refactorTarget === document.querySelector("#theme-button"),
    ),
    true,
  );
  await panel.click('button:text-is("Cancel")');
  await page.waitForFunction(
    () => !document.querySelector("[data-ui-helper-placeholder]"),
  );
  const restored = await bounds();
  assert.equal(restored.style, before.style);
  for (const key of ["x", "y", "width", "height"])
    near(restored[key], before[key]);
}
console.log(
  "Move/eight resize handles, original DOM identity, neighbors and cancel/slot cleanup: PASS",
);

await page.click("#theme-button");
await panel.fill(
  'textarea[placeholder="Describe these changes…"]',
  "Saved baseline",
);
await panel.click('button[title="Save annotation"]');
await page.click("#theme-button");
await panel.fill(
  'textarea[placeholder="Describe these changes…"]',
  "Discarded draft",
);
await panel.click('button:text-is("Cancel")');
await page.click("#theme-button");
assert.equal(
  await panel.evaluate(() => document.querySelector("textarea").value),
  "Saved baseline",
);
await panel.click('button:text-is("Cancel")');

// Fail both clipboard paths: no export-done and no feedback reset is permitted.
await panel.evaluate(() => {
  window.refactorClipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard",
  );
  window.refactorExecCommand = document.execCommand;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("Denied");
      },
    },
  });
  document.execCommand = () => false;
});
await panel.click('button:text-is("Copy for AI")');
await panel.waitForFunction(() =>
  document.querySelector(".ui-notice")?.textContent.includes("Unable to copy"),
);
assert.equal(
  await panel.evaluate(() =>
    window.nativeTest.commands.some(
      (command) => command.type === "export-done",
    ),
  ),
  false,
);
assert.ok(
  await panel.evaluate(() =>
    document.querySelector(".ui-count").textContent.includes("1 notes"),
  ),
);
await panel.evaluate(() => {
  if (window.refactorClipboardDescriptor)
    Object.defineProperty(
      navigator,
      "clipboard",
      window.refactorClipboardDescriptor,
    );
  else delete navigator.clipboard;
  document.execCommand = window.refactorExecCommand;
});
console.log(
  "Saved draft cancellation and clipboard failure retaining feedback: PASS",
);

// Exercise the actual browser DOM compactor indirectly through exported Markdown.
await page.evaluate(() => {
  const element = document.createElement("p");
  element.id = "refactor-long-html";
  element.innerHTML =
    '<span data-padding="' +
    "a".repeat(900) +
    '">' +
    "x".repeat(300) +
    "</span>";
  document.body.prepend(element);
});
await page.click("#refactor-long-html span");
await panel.click('button[title="Save annotation"]');
const exported = await page.evaluate(
  () =>
    new Promise((resolve) => {
      // The harness content listener isn't public; send through its existing channel.
      const session = new URLSearchParams(location.search).get("session");
      const bus = new BroadcastChannel("ui-helper-panel-test:" + session);
      const id = crypto.randomUUID();
      bus.onmessage = ({ data }) => {
        if (data.type === "PANEL_RESULT" && data.id === id) {
          clearTimeout(timer);
          bus.close();
          resolve(data.result);
        }
      };
      const timer = setTimeout(() => {
        bus.close();
        resolve({ ok: false, error: "Export timeout" });
      }, 5000);
      bus.postMessage({
        type: "PANEL_COMMAND",
        id,
        command: { type: "export" },
      });
    }),
);
assert.equal(exported.ok, true);
assert.ok(exported.text.includes("x".repeat(237) + "...</span>"));
console.log(
  "Long-HTML compaction through real DOM and content export command: PASS",
);

// A draft opened during encoding must win over automatic GIF-editor selection.
await page.keyboard.press("Escape");
await panel.waitForFunction(() =>
  document.querySelector(".ui-count")?.textContent.includes("0 notes · 0 GIF"),
);
await panel.click('button[title="Inspect elements"]');
await panel.click('button[title="Record a GIF"]');
await page.click('button:text-is("Window")');
await panel.waitForSelector('button[title="Stop GIF recording"]');
await page.evaluate(() => {
  const send = chrome.runtime.sendMessage;
  window.refactorOriginalSend = send;
  chrome.runtime.sendMessage = async (message) => {
    if (message.type === "STOP_RECORDING")
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10000);
        window.releaseRefactorEncoding = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    return send(message);
  };
});
try {
  await panel.click('button[title="Stop GIF recording"]');
  await page.waitForFunction(
    () => typeof window.releaseRefactorEncoding === "function",
  );
  await page.click("#theme-button");
  await panel.fill(
    'textarea[placeholder="Describe these changes…"]',
    "Draft opened during encoding",
  );
  await page.evaluate(() => window.releaseRefactorEncoding());
  await panel.waitForFunction(() =>
    document.querySelector(".ui-count")?.textContent.includes("1 GIF"),
  );
  assert.equal(
    await panel.evaluate(() => document.querySelector("textarea").value),
    "Draft opened during encoding",
  );
  assert.equal(
    await panel.evaluate(
      () => !!document.querySelector(".ui-recording-editor"),
    ),
    false,
  );
} finally {
  await page.evaluate(() => {
    window.releaseRefactorEncoding?.();
    chrome.runtime.sendMessage = window.refactorOriginalSend;
  });
}
console.log(
  "Draft opened during delayed GIF encoding remains selected after file save: PASS (mock capture)",
);
