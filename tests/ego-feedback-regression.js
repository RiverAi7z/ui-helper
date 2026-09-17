// Build, run tests/sidepanel-harness.mjs, then prefix uiHelperTestSpace.
// Real built UI + keyboard/pointer input; only Chrome transport/capture is mocked.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const panel = task.page("p2");
const assert = (await import("node:assert/strict")).default;
const session = `feedback-${Date.now()}`;
await page.goto(`http://127.0.0.1:5186/?session=${session}`);
await panel.goto(`http://127.0.0.1:5186/sidepanel.html?session=${session}`);
await panel.click('button[title="Inspect elements"]');
const heading = await page.evaluate(() => {
  const r = document.querySelector("h1").getBoundingClientRect();
  // Select the heading container in its right-side padding, not either text run.
  return { x: r.right - 2, y: r.y + 2 };
});
await page.mouse.click(heading.x, heading.y);
await page.waitForSelector(".ui-transform-se");
const handle = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector(".ui-transform-se")
    .getBoundingClientRect();
  return { x: r.x + 4, y: r.y + 4 };
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x - 250, handle.y - 60, { steps: 8 });
await page.mouse.up();
assert.deepEqual(
  await page.evaluate(() => {
    const slot = document.querySelector("[data-ui-helper-placeholder]");
    return {
      opacity: getComputedStyle(slot).opacity,
      nestedText: [...slot.shadowRoot.querySelectorAll("span")]
        .map((node) => node.textContent)
        .join(""),
      liveOpacity: getComputedStyle(document.querySelector("h1")).opacity,
    };
  }),
  {
    opacity: "0",
    nestedText: "选择、调整、批注，然后交给 AI。",
    liveOpacity: "1",
  },
);
await panel.click('button:text-is("Cancel")');
assert.equal(
  await page.evaluate(
    () => document.querySelectorAll("[data-ui-helper-placeholder]").length,
  ),
  0,
);
await panel.click('button[title="Record a GIF"]');
await page.click('button:text-is("Window")');
await panel.waitForSelector('button[title="Stop GIF recording"]');
await panel.click('button[title="Stop GIF recording"]');
await panel.waitForSelector(".ui-recording-editor textarea");
await panel.click(".ui-recording-editor textarea");
await panel.keyboard.type("GIF typing test");
await panel.keyboard.insertText(" 中文备注");
await panel.keyboard.press("Backspace");
const comment = "GIF typing test 中文备";
assert.equal(
  await panel.evaluate(() => document.querySelector("textarea").value),
  comment,
);
await panel.click('button[title="Save recording annotation"]');
await page.click('.ui-recording-window-tag[title="Annotate recording"]');
await panel.waitForSelector(".ui-recording-editor textarea");
assert.equal(
  await panel.evaluate(() => document.querySelector("textarea").value),
  comment,
);
await panel.click(".ui-recording-editor textarea");
await panel.keyboard.insertText(" cancelled edit");
await panel.click('button:text-is("Cancel")');
await page.click('.ui-recording-window-tag[title="Annotate recording"]');
await panel.waitForSelector(".ui-recording-editor textarea");
assert.equal(
  await panel.evaluate(() => document.querySelector("textarea").value),
  comment,
);
console.log(
  "PASS nested resize placeholder hiding, cleanup, GIF typing, save/reopen and cancel",
);
