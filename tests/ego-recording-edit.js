// Prefix with globalThis.uiHelperTestSpace and globalThis.uiHelperProjectRoot,
// then pipe to ego-browser nodejs. Requires build and the test-page server.
// Covers recording-mode UI with mocked capture/file APIs, not GIF capture quality.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const fs = await import("node:fs/promises");
const assert = (await import("node:assert/strict")).default;
await page.goto("http://127.0.0.1:5173");
await page.evaluate(() => {
  const directory = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async () => ({
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    }),
  };
  window.showDirectoryPicker = async () => directory;
  window.testRecordingMessages = [];
  window.chrome.runtime = {
    onMessage: { addListener() {}, removeListener() {} },
    sendMessage: async (message) => {
      window.testRecordingMessages.push(message.type);
      return message.type === "STOP_RECORDING"
        ? {
            ok: true,
            dataUrl:
              "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
            width: 1,
            height: 1,
            frames: 1,
          }
        : { ok: true };
    },
  };
});
await page.evaluate(
  await fs.readFile(
    `${globalThis.uiHelperProjectRoot}/apps/extension/.output/chrome-mv3/content-scripts/content.js`,
    "utf8",
  ),
);
console.log(await page.snapshot());
const editor = 'textarea[placeholder="Describe these changes…"]';
async function drag(x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}
async function isRecording() {
  assert.equal(
    await page.evaluate(
      () =>
        !!document
          .querySelector("ui-helper-root")
          .shadowRoot.querySelector('[title="Stop GIF recording"]'),
    ),
    true,
  );
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
await page.click("#theme-button");
await page.fill(editor, "Draft before recording");
const panel = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector('[aria-label="Move panel"]')
    .getBoundingClientRect();
  return { x: r.x + 12, y: r.y + 12 };
});
await drag(panel.x, panel.y, 420, 0);
await page.click('button[title="Record a GIF"]');
await page.fill('[aria-label="Recording limit seconds"]', "60");
await page.click('button:text-is("Window")');
await isRecording();
assert.equal(
  await page.evaluate(
    () =>
      document
        .querySelector("ui-helper-root")
        .shadowRoot.querySelector("textarea").value,
  ),
  "Draft before recording",
);
assert.deepEqual(
  await page.evaluate(() => {
    const s = document.querySelector("ui-helper-root").shadowRoot;
    return [
      "Inspect elements",
      "Annotate a region",
      "Hide style-change preview",
    ].map((title) => s.querySelector(`[title="${title}"]`).disabled);
  }),
  [false, false, false],
);
const before = await page.evaluate(() =>
  document.querySelector("#theme-button").getBoundingClientRect().toJSON(),
);
const handle = await page.evaluate(() => {
  const r = document
    .querySelector("ui-helper-root")
    .shadowRoot.querySelector(".ui-transform-se")
    .getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await drag(handle.x, handle.y, 40, 20);
const resized = await page.evaluate(() =>
  document.querySelector("#theme-button").getBoundingClientRect().toJSON(),
);
assert.ok(Math.abs(resized.width - before.width - 40) < 1);
assert.ok(Math.abs(resized.height - before.height - 20) < 1);
await drag(resized.x + 20, resized.y + 20, 20, -10);
const moved = await page.evaluate(() =>
  document.querySelector("#theme-button").getBoundingClientRect().toJSON(),
);
assert.ok(Math.abs(moved.x - resized.x - 20) < 1);
await page.click('button[title="Hide style-change preview"]');
assert.ok(
  Math.abs(
    (await page.evaluate(
      () =>
        document.querySelector("#theme-button").getBoundingClientRect().width,
    )) - before.width,
  ) < 1,
);
await page.click('button[title="Show style-change preview"]');
assert.ok(
  Math.abs(
    (await page.evaluate(
      () =>
        document.querySelector("#theme-button").getBoundingClientRect().width,
    )) - resized.width,
  ) < 1,
);
await isRecording();
await page.click('button[title="Save annotation"]');
// Select an element again during recording, then create a region.
await page.click("#theme-button");
assert.equal(
  await page.evaluate(
    () =>
      document
        .querySelector("ui-helper-root")
        .shadowRoot.querySelector("textarea").value,
  ),
  "Draft before recording",
);
await page.click('button[title="Save annotation"]');
await page.click('button[title="Annotate a region"]');
await drag(500, 440, 120, 60);
await page.fill(editor, "Region drafted during recording");
await isRecording();
await page.click('button[title="Stop GIF recording"]');
await page.waitForFunction(
  () =>
    !!document
      .querySelector("ui-helper-root")
      .shadowRoot.querySelector('[title="Annotate recording"]'),
);
assert.equal(
  await page.evaluate(
    () =>
      document
        .querySelector("ui-helper-root")
        .shadowRoot.querySelector("textarea").value,
  ),
  "Region drafted during recording",
);
await page.click('button[title="Save annotation"]');
assert.equal(
  await page.evaluate(
    () =>
      document
        .querySelector("ui-helper-root")
        .shadowRoot.querySelectorAll(".ui-marker").length,
  ),
  2,
);
assert.deepEqual(await page.evaluate(() => window.testRecordingMessages), [
  "START_RECORDING",
  "STOP_RECORDING",
]);
console.log(
  "PASS: recording keeps drafts, enables inspect/move/resize/region/preview; stopping preserves the active region draft",
);
console.log(await page.snapshot());
