// Run after npm run build and npm run test-page:
// Prefix this script with globalThis.uiHelperTestSpace = <existing space id>;
// and globalThis.uiHelperProjectRoot = <absolute project path>;
// then pipe it to ego-browser nodejs (the remote runtime does not inherit env).
// Runs the built content script with only the extension messaging API stubbed.
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
});
await page.evaluate(
  await fs.readFile(
    `${globalThis.uiHelperProjectRoot}/apps/extension/.output/chrome-mv3/content-scripts/content.js`,
    "utf8",
  ),
);
await page.waitForFunction(() => document.fonts.status === "loaded");
console.log(await page.snapshot());
await page.click('button[title="Inspect elements"]');
await page.click("#theme-button");
const panel = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector('[aria-label="Move panel"]')
    .getBoundingClientRect();
  return { x: r.x + 12, y: r.y + 12 };
});
async function drag(x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
await drag(panel.x, panel.y, 420, 0);
async function measure() {
  return page.evaluate(() => {
    const target = document.querySelector("#theme-button");
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      target: rect(target),
      sibling: rect(target.previousElementSibling),
      parent: rect(target.parentElement),
      siblingStyle: target.previousElementSibling.getAttribute("style"),
      dark: document.body.classList.contains("dark"),
    };
  });
}
function near(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1,
    `${message}: ${actual} != ${expected}`,
  );
}
function sameRect(actual, expected, message) {
  for (const key of ["x", "y", "width", "height"])
    near(actual[key], expected[key], `${message}.${key}`);
}
const baseline = await measure();
function unchangedNeighbors(state) {
  sameRect(state.sibling, baseline.sibling, "sibling");
  sameRect(state.parent, baseline.parent, "parent");
  assert.equal(state.siblingStyle, baseline.siblingStyle);
  assert.equal(state.dark, false, "editing must not activate the theme button");
}
for (const handle of ["se", "nw", "e", "w", "n", "s", "ne", "sw"]) {
  const before = await measure();
  const point = await page.evaluate((handle) => {
    const r = document
      .querySelector("ui-helper-root")
      .shadowRoot.querySelector(`.ui-transform-${handle}`)
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, handle);
  const dx = handle.includes("w") ? -10 : handle.includes("e") ? 10 : 0;
  const dy = handle.includes("n") ? -10 : handle.includes("s") ? 10 : 0;
  await drag(point.x, point.y, dx, dy);
  const after = await measure();
  near(
    after.target.width,
    before.target.width + Math.abs(dx),
    `${handle} width`,
  );
  near(
    after.target.height,
    before.target.height + Math.abs(dy),
    `${handle} height`,
  );
  near(after.target.x, before.target.x + Math.min(0, dx), `${handle} x`);
  near(after.target.y, before.target.y + Math.min(0, dy), `${handle} y`);
  unchangedNeighbors(after);
  console.log(`${handle}: resized only the selected element PASS`);
}
const resized = await measure();
await drag(
  resized.target.x + resized.target.width / 2,
  resized.target.y + resized.target.height / 2,
  30,
  -20,
);
const moved = await measure();
near(moved.target.x, resized.target.x + 30, "move x");
near(moved.target.y, resized.target.y - 20, "move y");
unchangedNeighbors(moved);
await page.click('button[title="Hide style-change preview"]');
const hidden = await measure();
sameRect(hidden.target, baseline.target, "preview off");
unchangedNeighbors(hidden);
await page.click('button[title="Show style-change preview"]');
sameRect((await measure()).target, moved.target, "preview on");
console.log(await page.snapshot());
await page.click('button:text-is("Cancel")');
const cancelled = await measure();
sameRect(cancelled.target, baseline.target, "cancel");
unchangedNeighbors(cancelled);
assert.equal(
  await page.evaluate(
    () => document.querySelector("#theme-button").style.cssText,
  ),
  "",
);
console.log("move, preview off/on, cancel: PASS");
