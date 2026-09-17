// Start: npm run build && node tests/sidepanel-harness.mjs
// Set uiHelperTestSpace to an existing Ego space with p1 (page), p2 (panel).
// Uses real production bundles in separate documents with mocked Chrome APIs.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const panel = task.page("p2");
const assert = (await import("node:assert/strict")).default;
const session = crypto.randomUUID();
await page.goto(`http://127.0.0.1:5186/?session=${session}`);
await panel.goto(`http://127.0.0.1:5186/sidepanel.html?session=${session}`);
await panel.waitForSelector('button[title="Inspect elements"]');
assert.equal(
  await panel.evaluate(
    () =>
      !!document.querySelector(
        ".ui-sidebar-header strong, .ui-toolbar .ui-divider",
      ),
  ),
  false,
);
for (const width of [320, 360, 480]) {
  await panel.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 780,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const bounds = await panel.evaluate(() => {
    const buttons = [...document.querySelectorAll(".ui-toolbar > button")].map(
      (e) => e.getBoundingClientRect(),
    );
    return {
      centers: buttons.map((r) => r.y + r.height / 2),
      fits: buttons.every((r) => r.left >= 0 && r.right <= innerWidth),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(bounds.centers.every((y) => Math.abs(y - bounds.centers[0]) < 1));
  assert.equal(bounds.fits, true);
  assert.equal(bounds.overflow, false);
}
console.log("Copy for AI stays on the toolbar row at 320/360/480px: PASS");
await panel.click('button[title="Inspect elements"]');
await page.click("#theme-button");
await panel.fill(
  'textarea[placeholder="Describe these changes…"]',
  "Native panel annotation",
);
await panel.click('button[title="Save annotation"]');
await page.click("#theme-button");
await panel.waitForSelector('textarea[placeholder="Describe these changes…"]');
assert.equal(
  await panel.evaluate(() => document.querySelector("textarea").value),
  "Native panel annotation",
);
const panelSize = () =>
  panel.evaluate(() => {
    const r = document.querySelector(".ui-toolbar").getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      font: getComputedStyle(document.querySelector(".ui-copy-button"))
        .fontSize,
    };
  });
const before = await panelSize();
await page.evaluate(() => {
  document.documentElement.style.zoom = "1.5";
});
assert.deepEqual(await panelSize(), before);
assert.deepEqual(
  await page.evaluate(() => ({
    bodyUnchanged: document.body.style.cssText === window.originalBodyStyle,
    noPanelInPage: !document
      .querySelector("ui-helper-root")
      .shadowRoot.querySelector(".ui-sidebar"),
  })),
  { bodyUnchanged: true, noPanelInPage: true },
);
await page.evaluate(() =>
  document.documentElement.style.removeProperty("zoom"),
);
await panel.click('button:text-is("Cancel")');
console.log(
  "Cross-document selection/save/cancel, page layout untouched, isolated page CSS zoom: PASS",
);
await panel.click('button[title="Record a GIF"]');
assert.equal(
  await panel.evaluate(() => !!document.querySelector(".ui-record-bar-close")),
  false,
);
// The existing camera toggle still closes/reopens recording options.
await panel.click('button[title="Record a GIF"]');
assert.equal(
  await panel.evaluate(() => !!document.querySelector(".ui-record-bar")),
  false,
);
await panel.click('button[title="Record a GIF"]');
await panel.click('button:text-is("Window")');
await panel.waitForSelector('button[title="Stop GIF recording"]');
await panel.click('button[title="Stop GIF recording"]');
await panel.waitForSelector(
  'textarea[placeholder="Describe what happens in this recording…"]',
);
assert.ok(
  await panel.evaluate(() =>
    window.nativeTest.files.some((item) => item.name.endsWith(".gif")),
  ),
);
assert.equal(await page.evaluate(() => window.nativeTest.crops[0].x), 0);
assert.equal(
  await page.evaluate(
    () =>
      window.nativeTest.crops[0].width ===
      window.nativeTest.crops[0].viewportWidth,
  ),
  true,
);
await panel.fill(
  'textarea[placeholder="Describe what happens in this recording…"]',
  "Recording note",
);
const keptPath = await panel.evaluate(() =>
  document.querySelector(".ui-recording-path").textContent.slice(1),
);
await panel.click('button[title="Save recording annotation"]');
await panel.click('button[title="Record a GIF"]');
await panel.click('button:text-is("Window")');
await panel.waitForSelector('button[title="Stop GIF recording"]');
await panel.click('button[title="Stop GIF recording"]');
await panel.waitForSelector('button[aria-label="Delete recording"]');
const removedPath = await panel.evaluate(() =>
  document.querySelector(".ui-recording-path").textContent.slice(1),
);
const filesBefore = await panel.evaluate(() => window.nativeTest.files);
await panel.click('button[aria-label="Delete recording"]');
await panel.waitForFunction(
  () =>
    !document.querySelector(".ui-recording-editor") &&
    document.querySelector(".ui-count").textContent.includes("1 GIF"),
);
assert.equal(
  await page.evaluate(
    () =>
      document
        .querySelector("ui-helper-root")
        .shadowRoot.querySelectorAll(".ui-recording-tag-button").length,
  ),
  1,
);
assert.deepEqual(
  await panel.evaluate(() => window.nativeTest.files),
  filesBefore,
);
await panel.click('button:text-is("Copy for AI")');
await panel.waitForFunction(() =>
  document.querySelector(".ui-count")?.textContent.includes("0 notes · 0 GIF"),
);
const copied = (await import("node:child_process")).execFileSync(
  "/usr/bin/pbpaste",
  { encoding: "utf8" },
);
assert.ok(copied.includes(keptPath));
assert.ok(!copied.includes(removedPath));
console.log(
  "Compact controls, recording delete/count/marker cleanup, retained files, export exclusion and copy/reset: PASS (mock Chrome capture/transport)",
);
