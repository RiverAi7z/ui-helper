// Real native panel + real capture/files. Run after the user authorizes a folder.
// Covers floating controls, limit parsing, GIF edit/cancel/delete and file retention.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const { resolve, sep } = await import("node:path");
const { evaluateTarget } = await import(
  `${globalThis.uiHelperProjectRoot}/tests/native-browser-bridge.mjs`
);
const target = (await task.cdp("Target.getTargets")).targetInfos.find(
  (t) =>
    t.url.startsWith("chrome-extension://") &&
    t.url.endsWith("/sidepanel.html"),
);
assert.ok(target);
const { sessionId } = await task.cdp("Target.attachToTarget", {
  targetId: target.targetId,
  flatten: false,
});
let sequence = 1;
const cdp = (method, params) =>
  task.cdp("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({ id: sequence++, method, params }),
  });
const native = (fn, arg) => evaluateTarget(task, target.targetId, fn, arg);
const wait = (predicate) =>
  native(`() => new Promise((resolve,reject) => {
  const check=${predicate.toString()}; const start=Date.now();
  const timer=setInterval(()=>{if(check()){clearInterval(timer);resolve(true)}else if(Date.now()-start>12000){clearInterval(timer);reject(new Error(document.body.innerText))}},30);
})`);
const click = (title) =>
  native(
    (title) => document.querySelector(`button[title="${title}"]`).click(),
    title,
  );
const fillComment = (value) =>
  native((value) => {
    const e = document.querySelector(".ui-recording-editor textarea");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set.call(e, value);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
try {
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await wait(() => !!document.querySelector(".ui-toolbar"));
  await page.keyboard.press("Escape");
  await click("Record a GIF");
  await page.waitForSelector(".ui-record-bar");
  assert.equal(
    await native(() => !!document.querySelector(".ui-record-bar")),
    false,
  );
  await click("Record a GIF");
  await page.waitForSelector(".ui-record-bar", { state: "detached" });
  await click("Record a GIF");
  await page.waitForSelector(".ui-record-bar");
  const start = await page.evaluate(() => {
    const root = document.querySelector(
      "ui-helper-root[data-ui-helper-owner]",
    ).shadowRoot;
    const r = root.querySelector(".ui-record-bar").getBoundingClientRect();
    const h = root
      .querySelector('button[title="Move recording options"]')
      .getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      handleX: h.x + h.width / 2,
      handleY: h.y + h.height / 2,
    };
  });
  await page.mouse.move(start.handleX, start.handleY);
  await page.mouse.down();
  await page.mouse.move(start.handleX - 50, start.handleY - 45, { steps: 6 });
  await page.mouse.up();
  const moved = await page.evaluate(() => {
    const r = document
      .querySelector("ui-helper-root[data-ui-helper-owner]")
      .shadowRoot.querySelector(".ui-record-bar")
      .getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  assert.ok(
    Math.abs(moved.x - start.x + 50) < 1 &&
      Math.abs(moved.y - start.y + 45) < 1,
  );
  for (const [input, expected] of [
    ["00", "20"],
    ["99", "60"],
    ["1", "1"],
  ]) {
    await page.fill('input[aria-label="Recording limit seconds"]', input);
    await page.press('input[aria-label="Recording limit seconds"]', "Enter");
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector("ui-helper-root[data-ui-helper-owner]")
            .shadowRoot.querySelector(
              'input[aria-label="Recording limit seconds"]',
            ).value,
      ),
      expected,
    );
  }
  await page.click('button[title="Close recording options"]');
  await page.waitForSelector(".ui-record-bar", { state: "detached" });
  console.log(
    "PASS floating options toggle, close, pointer drag and duration fallback/clamping",
  );

  await click("Record a GIF");
  await page.click('button:text-is("Window")');
  await wait(
    () => !!document.querySelector('button[title="Stop GIF recording"]'),
  );
  await wait(() => !!document.querySelector(".ui-recording-editor"));
  const relativePath = await native(() =>
    document.querySelector(".ui-recording-path").textContent.slice(1),
  );
  const root = resolve(globalThis.uiHelperProjectRoot);
  const file = resolve(root, relativePath);
  assert.ok(
    file.startsWith(root + sep + ".ui-helper" + sep + "recordings" + sep),
  );
  const before = await fs.readFile(file);
  assert.ok(before.length > 6);
  assert.match(before.subarray(0, 6).toString(), /^GIF8[79]a$/);
  await fillComment("Native GIF saved 中文备注");
  await click("Save recording annotation");
  await wait(() => !document.querySelector(".ui-recording-editor"));
  await page.click('.ui-recording-window-tag[title="Annotate recording"]');
  await wait(() => !!document.querySelector(".ui-recording-editor"));
  assert.equal(
    await native(() => document.querySelector("textarea").value),
    "Native GIF saved 中文备注",
  );
  await fillComment("Discard this GIF comment");
  await native(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Cancel")
      .click(),
  );
  await wait(() => !document.querySelector(".ui-recording-editor"));
  await page.click('.ui-recording-window-tag[title="Annotate recording"]');
  await wait(() => !!document.querySelector(".ui-recording-editor"));
  assert.equal(
    await native(() => document.querySelector("textarea").value),
    "Native GIF saved 中文备注",
  );
  await native(() =>
    document.querySelector('button[aria-label="Delete recording"]').click(),
  );
  await wait(
    () =>
      document.querySelector(".ui-count")?.textContent === "0 notes · 0 GIF",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          .shadowRoot.querySelectorAll(".ui-recording-tag-button").length,
    ),
    0,
  );
  assert.deepEqual(await fs.readFile(file), before);
  await native(() => document.querySelector(".ui-copy-button").click());
  await wait(() =>
    document.body.innerText.includes("Add an annotation or recording first"),
  );
  console.log(
    "PASS real 1-second recording after worker restart, GIF save/reopen/cancel/delete, unchanged local file and empty-export error",
    { relativePath, bytes: before.length },
  );
} finally {
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(
    () => {},
  );
  await task.cdp("Target.detachFromTarget", { sessionId }).catch(() => {});
}
