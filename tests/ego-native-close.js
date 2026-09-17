// Closes/reopens the REAL browser sidebar. p2 is an agent-created control tab;
// it is closed afterwards. Uses the normal sidePanel API with a CDP user gesture.
const task = await taskSpace(globalThis.uiHelperTestSpace),
  page = task.page("p1"),
  control = task.page("p2");
const { evaluateTarget } = await import(
  `${globalThis.uiHelperProjectRoot}/tests/native-browser-bridge.mjs`
);
const assert = (await import("node:assert/strict")).default;
let panel = (await task.cdp("Target.getTargets")).targetInfos.find(
  (t) =>
    t.url.startsWith("chrome-extension://") &&
    t.url.endsWith("/sidepanel.html"),
);
let { sessionId } = await task.cdp("Target.attachToTarget", {
  targetId: panel.targetId,
  flatten: false,
});
const focus = (enabled) =>
  task.cdp("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({
      id: 1,
      method: "Emulation.setFocusEmulationEnabled",
      params: { enabled },
    }),
  });
const native = (fn, arg) => evaluateTarget(task, panel.targetId, fn, arg);
try {
  await focus(true);
  await page.waitForFunction(
    () =>
      !!document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        ?.shadowRoot.querySelector(".ui-layer"),
  );
  await page.keyboard.press("Escape");
  await native(() =>
    document.querySelector('button[title="Inspect elements"]').click(),
  );
  await page.click("#theme-button");
  await native(() => {
    const e = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set.call(e, "Draft across close");
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const source = await native(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return { tabId: tab.id, windowId: tab.windowId };
  });
  await control.goto(panel.url);
  await control.evaluate(async (windowId) => {
    await chrome.sidePanel.close({ windowId });
  }, source.windowId);
  await page.waitForFunction(
    () =>
      !document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        ?.shadowRoot.querySelector(".ui-layer"),
  );
  console.log(
    "PASS closing the real browser sidebar deactivates page interception/overlays",
  );
  const result = await control.cdp("Runtime.evaluate", {
    expression: `(async()=>{await chrome.tabs.update(${source.tabId},{active:true});await chrome.sidePanel.open({windowId:${source.windowId}});return true})()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  assert.equal(result.result?.value, true);
  const controlId = (await task.tabs()).find((t) => t.label === "p2").targetId;
  panel = (await task.cdp("Target.getTargets")).targetInfos.find(
    (t) => t.url === panel.url && t.targetId !== controlId,
  );
  assert.ok(panel);
  ({ sessionId } = await task.cdp("Target.attachToTarget", {
    targetId: panel.targetId,
    flatten: false,
  }));
  await focus(true);
  await native(
    () =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (
            document.querySelector("textarea")?.value === "Draft across close"
          ) {
            clearInterval(timer);
            resolve(true);
          } else if (Date.now() - start > 6000) {
            clearInterval(timer);
            reject(new Error(document.body.innerText));
          }
        }, 50);
      }),
  );
  await native(() =>
    [...document.querySelectorAll("button")]
      .find((e) => e.textContent === "Cancel")
      .click(),
  );
  console.log(
    "PASS reopening the real browser sidebar restores the original page draft",
  );
  await control.close();
} finally {
  await focus(false).catch(() => {});
  await task.cdp("Target.detachFromTarget", { sessionId }).catch(() => {});
}
