// Prefix with globalThis.uiHelperTestSpace = <existing Ego Lite space id>;
// and globalThis.uiHelperProjectRoot = <absolute project path>;
// then pipe to ego-browser nodejs after npm run build / npm run test-page.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const fs = await import("node:fs/promises");
const assert = (await import("node:assert/strict")).default;
await page.goto("http://127.0.0.1:5173");
// Test the real built content script; only Chrome messaging is stubbed.
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
console.log(await page.snapshot());
await page.click('button[title="Inspect elements"]');
const editor = 'textarea[placeholder="Describe these changes…"]';
async function state() {
  return page.evaluate(() => {
    const shadow = document.querySelector("ui-helper-root").shadowRoot;
    return {
      markers: [...shadow.querySelectorAll(".ui-marker")].map(
        (e) => e.textContent,
      ),
      comment: shadow.querySelector("textarea")?.value,
      dark: document.body.classList.contains("dark"),
    };
  });
}
async function expectNote(markers, comment) {
  const actual = await state();
  assert.deepEqual(actual.markers, markers);
  assert.equal(actual.comment, comment);
  assert.equal(
    actual.dark,
    false,
    "selection must not activate the page button",
  );
}
await page.click("#theme-button");
await page.fill(editor, "Original theme note");
await page.click('button[title="Save annotation"]');
for (let i = 0; i < 3; i++) {
  await page.click("#theme-button");
  await expectNote(["1"], "Original theme note");
  await page.click('button[title="Save annotation"]');
}
console.log("Repeated selection reuses one note and its content: PASS");
await page.click("#theme-button");
await page.fill(editor, "Updated theme note");
await page.click('button[title="Save annotation"]');
await page.click("#theme-button");
await expectNote(["1"], "Updated theme note");
await page.fill(editor, "Discard this edit");
await page.click('button:text-is("Cancel")');
await page.click("#theme-button");
await expectNote(["1"], "Updated theme note");
await page.click('button[title="Save annotation"]');
console.log("Save updates original; Cancel restores its saved content: PASS");
// A separate DOM element must still get a separate annotation.
await page.click(".hero-actions .primary-button");
await expectNote(["1", "2"], "");
await page.fill(editor, "Hover button note");
await page.click('button[title="Save annotation"]');
await page.click("#theme-button");
await expectNote(["1", "2"], "Updated theme note");
await page.click('button[title="Save annotation"]');
console.log("Different elements remain independent: PASS");
// Framework-style node replacement while preview's rebinding observer is off.
await page.click('button[title="Hide style-change preview"]');
await page.evaluate(() => {
  const element = document.querySelector("#theme-button");
  element.replaceWith(element.cloneNode(true));
});
await page.click("#theme-button");
await expectNote(["1", "2"], "Updated theme note");
await page.click('button[title="Save annotation"]');
await page.click('button[title="Show style-change preview"]');
console.log(
  "Replacement node reuses original annotation with preview disabled: PASS",
);
await page.click("#theme-button");
await page.click('button[title="Delete annotation"]');
assert.equal((await state()).markers.length, 1);
await page.click("#theme-button");
const recreated = await state();
assert.equal(recreated.markers.length, 2);
assert.equal(recreated.comment, "");
await page.click('button:text-is("Cancel")');
assert.equal((await state()).markers.length, 1);
console.log(
  "Delete permits a fresh note; cancelling it removes only that draft: PASS",
);
console.log(await page.snapshot());
