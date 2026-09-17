// Prefix with globalThis.uiHelperTestSpace and globalThis.uiHelperProjectRoot,
// then pipe to ego-browser nodejs after build. Chrome messaging is stubbed.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const fs = await import("node:fs/promises");
const assert = (await import("node:assert/strict")).default;
await page.goto("http://127.0.0.1:5173");
await page.mouse.move(700, 500);
await page.mouse.wheel(0, 618);
await page.waitForFunction(
  () =>
    document.querySelector(".swatch.coral").getBoundingClientRect().top < 400,
);
console.log(await page.snapshot());
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
await page.click('button[title="Inspect elements"]');
await page.click(".swatch.coral");
const panel = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector('[aria-label="Move panel"]')
    .getBoundingClientRect();
  return { x: r.x + 12, y: r.y + 12 };
});
await page.mouse.move(panel.x, panel.y);
await page.mouse.down();
await page.mouse.move(40, 120, { steps: 8 });
await page.mouse.up();
async function measure() {
  return page.evaluate(() => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      target: rect(document.querySelector(".coral")),
      neighbors: [
        ...document.querySelectorAll(
          ".swatch:not(.coral),.swatches,.glass-card,.panel",
        ),
      ].map((e) => ({ rect: rect(e), style: e.getAttribute("style") })),
    };
  });
}
function near(a, b, label) {
  assert.ok(Math.abs(a - b) < 1, `${label}: ${a} != ${b}`);
}
function sameRect(a, b, label) {
  for (const k of ["x", "y", "width", "height"])
    near(a[k], b[k], `${label}.${k}`);
}
const baseline = await measure();
function neighborsUnchanged(state) {
  state.neighbors.forEach((n, i) => {
    sameRect(n.rect, baseline.neighbors[i].rect, `neighbor ${i}`);
    assert.equal(n.style, baseline.neighbors[i].style);
  });
}
async function resize(handle, dx, dy) {
  const before = await measure();
  const p = await page.evaluate((handle) => {
    const r = document
      .querySelector("ui-helper-root")
      .shadowRoot.querySelector(`.ui-transform-${handle}`)
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, handle);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2, { steps: 4 });
  neighborsUnchanged(await measure());
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 4 });
  await page.mouse.up();
  const after = await measure();
  neighborsUnchanged(after);
  near(
    after.target.width,
    before.target.width +
      (handle.includes("w") ? -dx : handle.includes("e") ? dx : 0),
    `${handle} width`,
  );
  near(
    after.target.height,
    before.target.height +
      (handle.includes("n") ? -dy : handle.includes("s") ? dy : 0),
    `${handle} height`,
  );
  near(
    after.target.x,
    before.target.x + (handle.includes("w") ? dx : 0),
    `${handle} x`,
  );
  near(
    after.target.y,
    before.target.y + (handle.includes("n") ? dy : 0),
    `${handle} y`,
  );
  console.log(
    `${handle} ${dx},${dy}: selected swatch changes; all neighbors and ancestor panels unchanged PASS`,
  );
}
// Reproduce the large northwest drag from the user's recording, then shrink.
await resize("nw", -230, -40);
await resize("se", -160, -20);
for (const h of ["n", "s", "e", "w", "ne", "sw", "se", "nw"]) {
  await resize(
    h,
    h.includes("w") ? -10 : h.includes("e") ? 10 : 0,
    h.includes("n") ? -10 : h.includes("s") ? 10 : 0,
  );
}
const beforeMove = await measure();
await page.mouse.move(beforeMove.target.x + 30, beforeMove.target.y + 30);
await page.mouse.down();
await page.mouse.move(beforeMove.target.x + 70, beforeMove.target.y + 50, {
  steps: 8,
});
await page.mouse.up();
const moved = await measure();
neighborsUnchanged(moved);
near(moved.target.x, beforeMove.target.x + 40, "move x");
near(moved.target.y, beforeMove.target.y + 20, "move y");
await page.click('button[title="Hide style-change preview"]');
const hidden = await measure();
neighborsUnchanged(hidden);
sameRect(hidden.target, baseline.target, "preview off");
await page.click('button[title="Show style-change preview"]');
sameRect((await measure()).target, moved.target, "preview on");
await page.click('button:text-is("Cancel")');
const cancelled = await measure();
sameRect(cancelled.target, baseline.target, "cancel");
neighborsUnchanged(cancelled);
assert.equal(
  await page.evaluate(() => document.querySelector(".coral").style.cssText),
  "",
);
console.log("Move, preview toggle and cancel PASS");
