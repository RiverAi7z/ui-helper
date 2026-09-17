// Prefix with uiHelperTestSpace / uiHelperProjectRoot and pipe to ego-browser nodejs.
// Uses the built content script; messaging and clipboard writes are stubbed.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const fs = await import("node:fs/promises");
const assert = (await import("node:assert/strict")).default;
await page.goto("http://127.0.0.1:5173");
await page.evaluate(() => {
  window.chrome.runtime = {
    onMessage: { addListener() {}, removeListener() {} },
    sendMessage: async () => ({}),
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        window.testClipboard = text;
      },
    },
  });
  window.originalThemeNode = document.querySelector("#theme-button");
});
await page.evaluate(
  await fs.readFile(
    `${globalThis.uiHelperProjectRoot}/apps/extension/.output/chrome-mv3/content-scripts/content.js`,
    "utf8",
  ),
);
console.log(await page.snapshot());
async function drag(x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
const toolbar = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector('[aria-label="Move toolbar"]')
    .getBoundingClientRect();
  return { x: r.x + 12, y: r.y + 15 };
});
await drag(toolbar.x, toolbar.y, 0, 80 - toolbar.y);
await page.click('button[title="Inspect elements"]');
async function select() {
  await page.click("#theme-button");
  const r = await page.evaluate(() => {
    const r = document
      .querySelector("ui-helper-root")
      .shadowRoot.querySelector('[aria-label="Move panel"]')
      .getBoundingClientRect();
    return { x: r.x + 12, y: r.y + 12 };
  });
  await drag(r.x, r.y, 900 - r.x, 200 - r.y);
}
async function size() {
  return page.evaluate(() => {
    const r = document.querySelector("#theme-button").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}
async function resize() {
  const r = await page.evaluate(() => {
    const r = document
      .querySelector("ui-helper-root")
      .shadowRoot.querySelector(".ui-transform-se")
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await drag(r.x, r.y, 40, 20);
}
async function slots(expected) {
  const state = await page.evaluate(() => {
    const slots = [
      ...document.querySelectorAll("[data-ui-helper-placeholder]"),
    ];
    return {
      count: slots.length,
      inert: slots.every(
        (s) => s.inert && s.getAttribute("aria-hidden") === "true",
      ),
      sameNode:
        window.originalThemeNode === document.querySelector("#theme-button"),
    };
  });
  assert.deepEqual(state, { count: expected, inert: true, sameNode: true });
}
await select();
const original = await size();
await resize();
const saved = await size();
await slots(1);
await page.click('button[title="Save annotation"]');
await select();
await resize();
await slots(1);
await page.click('button:text-is("Cancel")');
assert.deepEqual(await size(), saved);
await slots(1);
for (let i = 0; i < 2; i++) {
  await page.click('button[title="Hide style-change preview"]');
  assert.deepEqual(await size(), original);
  await slots(0);
  await page.click('button[title="Show style-change preview"]');
  assert.deepEqual(await size(), saved);
  await slots(1);
}
await select();
await page.click('button[title="Delete annotation"]');
assert.deepEqual(await size(), original);
await slots(0);
// Simulate a platform pointer cancellation after a real drag begins.
await select();
await page.evaluate(() => {
  document.addEventListener(
    "pointerdown",
    (e) => {
      window.testPointerId = e.pointerId;
    },
    { capture: true, once: true },
  );
});
const handle = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector(".ui-transform-se")
    .getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 40, handle.y + 20, { steps: 8 });
await page.evaluate(() =>
  document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector(".ui-element-transform")
    .dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: window.testPointerId,
      }),
    ),
);
await page.mouse.up();
assert.deepEqual(await size(), original);
await slots(0);
await resize();
await page.click('button[title="Save annotation"]');
await page.click('button:text-is("Copy for AI")');
await page.waitForFunction(() => !!window.testClipboard);
const exported = await page.evaluate(() => window.testClipboard);
assert.match(exported, /Preserve the original layout footprint/);
assert.doesNotMatch(
  exported,
  /ui-helper-resize-slot|data-ui-helper-placeholder/,
);
assert.deepEqual(await size(), original);
await slots(0);
// Export leaves inspection mode; verify the original native event listener survives.
await page.click("#theme-button");
assert.equal(
  await page.evaluate(() => document.body.classList.contains("dark")),
  true,
);
console.log(
  "PASS: save/reopen/cancel, preview cycles, delete, pointer cancellation, export cleanup, original node/listener retained",
);
