// Real tabCapture + offscreen GIF encoding + user-authorized project directory.
// Run after choosing a folder once in the native panel. Never stubs capture/files.
const task = await taskSpace(globalThis.uiHelperTestSpace),
  page = task.page("p1");
const { evaluateTarget } = await import(
  `${globalThis.uiHelperProjectRoot}/tests/native-browser-bridge.mjs`
);
const assert = (await import("node:assert/strict")).default;
const target = (await task.cdp("Target.getTargets")).targetInfos.find(
  (t) =>
    t.url.startsWith("chrome-extension://") &&
    t.url.endsWith("/sidepanel.html"),
);
const { sessionId } = await task.cdp("Target.attachToTarget", {
  targetId: target.targetId,
  flatten: false,
});
await task.cdp("Target.sendMessageToTarget", {
  sessionId,
  message: JSON.stringify({
    id: 1,
    method: "Emulation.setFocusEmulationEnabled",
    params: { enabled: true },
  }),
});
const native = (fn, arg) => evaluateTarget(task, target.targetId, fn, arg);
const wait = (predicate) =>
  native(
    `()=>new Promise((resolve,reject)=>{const check=${predicate.toString()};const start=Date.now();const timer=setInterval(()=>{if(check()){clearInterval(timer);resolve(true)}else if(Date.now()-start>12000){clearInterval(timer);reject(new Error(document.body.innerText))}},50)})`,
    undefined,
    15000,
  );
const button = (title) =>
  native((title) => {
    const e = document.querySelector('button[title="' + title + '"]');
    if (!e) throw new Error("Missing " + title);
    e.click();
  }, title);
const textButton = (text) =>
  native((text) => {
    const e = [...document.querySelectorAll("button")].find(
      (e) => e.textContent.trim() === text,
    );
    if (!e) throw new Error("Missing " + text);
    e.click();
  }, text);
const fill = (selector, value) =>
  native(
    ({ selector, value }) => {
      const e = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(
        e instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        "value",
      ).set.call(e, value);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, value },
  );
try {
  await native(() =>
    [...document.querySelectorAll("button")]
      .find((e) => e.textContent === "Retry connection")
      ?.click(),
  );
  await wait(() => !!document.querySelector(".ui-toolbar"));
  // Preserve any existing GIF; just close its editor.
  if (await native(() => !!document.querySelector(".ui-editor")))
    await textButton("Cancel");
  if (
    !(await page.evaluate(
      () =>
        !!document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          ?.shadowRoot.querySelector(".ui-record-bar"),
    ))
  )
    await button("Record a GIF");
  await page.fill('input[aria-label="Recording limit seconds"]', "3");
  const count = await native(
    () => document.querySelector(".ui-count").textContent,
  );
  await page.click('button:text-is("Window")');
  await wait(
    () => !!document.querySelector('button[title="Stop GIF recording"]'),
  );
  await button("Inspect elements");
  await page.click("#theme-button");
  await wait(
    () => !!document.querySelector(".ui-editor:not(.ui-recording-editor)"),
  );
  await fill("textarea", "Keep this draft during recording");
  await wait(
    () => !document.querySelector('button[title="Stop GIF recording"]'),
  );
  await wait(() =>
    document.querySelector(".ui-notice")?.textContent.includes("GIF saved"),
  );
  assert.equal(
    await native(() => document.querySelector("textarea")?.value),
    "Keep this draft during recording",
  );
  assert.notEqual(
    await native(() => document.querySelector(".ui-count").textContent),
    count,
  );
  await button("Save annotation");
  await page.click('.ui-recording-window-tag[title="Annotate recording"]');
  await wait(() => !!document.querySelector(".ui-recording-editor"));
  const windowRecording = await native(() => ({
    path: document.querySelector(".ui-recording-path").textContent.slice(1),
    meta: document.querySelector(".ui-recording-meta").textContent,
    scope: document.querySelector(".ui-editor-tag").textContent,
  }));
  assert.ok(windowRecording.scope.includes("Window"));
  await fill("textarea", "Real window capture");
  await button("Save recording annotation");
  console.log(
    "PASS real window capture, timed stop, encoding, saved file, editing during capture and draft preservation",
    windowRecording,
  );

  if (
    !(await page.evaluate(
      () =>
        !!document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          ?.shadowRoot.querySelector(".ui-record-bar"),
    ))
  )
    await button("Record a GIF");
  await page.fill('input[aria-label="Recording limit seconds"]', "3");
  await page.click('button:text-is("Area")');
  await page.mouse.move(800, 250);
  await page.mouse.down();
  await page.mouse.move(1100, 450, { steps: 8 });
  await page.mouse.up();
  await wait(
    () => !!document.querySelector('button[title="Stop GIF recording"]'),
  );
  await button("Stop GIF recording");
  await wait(() => !!document.querySelector(".ui-recording-editor"));
  const areaRecording = await native(() => ({
    path: document.querySelector(".ui-recording-path").textContent.slice(1),
    meta: document.querySelector(".ui-recording-meta").textContent,
    scope: document.querySelector(".ui-editor-tag").textContent,
  }));
  assert.ok(areaRecording.scope.includes("Area"));
  await fill("textarea", "Real area capture");
  await button("Save recording annotation");
  await native(() => document.querySelector(".ui-copy-button").click());
  await wait(
    () => document.querySelector(".ui-count").textContent === "0 notes · 0 GIF",
  );
  const copied = (await import("node:child_process")).execFileSync(
    "/usr/bin/pbpaste",
    { encoding: "utf8" },
  );
  assert.ok(
    copied.includes(windowRecording.path) &&
      copied.includes(areaRecording.path) &&
      copied.includes("Real window capture") &&
      copied.includes("Real area capture") &&
      copied.includes("300×200"),
  );
  console.log(
    "PASS real area capture, manual stop, recording annotations and exported paths/region",
    areaRecording,
  );
} finally {
  await task.cdp("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({
      id: 2,
      method: "Emulation.setFocusEmulationEnabled",
      params: { enabled: false },
    }),
  });
  await task.cdp("Target.detachFromTarget", { sessionId });
}
