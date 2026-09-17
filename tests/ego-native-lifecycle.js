// Real native panel lifecycle. p1 is authorized; p2 is an agent-owned,
// unauthorized tab in the same browser window. No extension reload is needed.
const task = await taskSpace(globalThis.uiHelperTestSpace),
  page = task.page("p1");
const { evaluateTarget } = await import(
  `${globalThis.uiHelperProjectRoot}/tests/native-browser-bridge.mjs`
);
const assert = (await import("node:assert/strict")).default;
let target = (await task.cdp("Target.getTargets")).targetInfos.find(
  (t) =>
    t.url.startsWith("chrome-extension://") &&
    t.url.endsWith("/sidepanel.html"),
);
let { sessionId } = await task.cdp("Target.attachToTarget", {
  targetId: target.targetId,
  flatten: false,
});
let sequence = 1;
const cdp = (method, params) =>
  task.cdp("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({ id: sequence++, method, params }),
  });
await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
const native = (fn, arg) => evaluateTarget(task, target.targetId, fn, arg);
const wait = (predicate) =>
  native(
    `()=>new Promise((resolve,reject)=>{const check=${predicate.toString()};const start=Date.now();const timer=setInterval(()=>{if(check()){clearInterval(timer);resolve(true)}else if(Date.now()-start>6000){clearInterval(timer);reject(new Error(document.body.innerText))}},30)})`,
  );
const click = (selector) =>
  native((selector) => {
    const e = document.querySelector(selector);
    if (!e) throw new Error("Missing " + selector);
    e.click();
  }, selector);
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
  await wait(() => !!document.querySelector(".ui-toolbar"));
  await page.waitForFunction(
    () =>
      !!document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        ?.shadowRoot.querySelector(".ui-layer"),
  );
  await page.keyboard.press("Escape");
  await click('button[title="Inspect elements"]');
  await page.click("#theme-button");
  await wait(() => !!document.querySelector("textarea"));
  await fill("textarea", "Reconnect draft");
  const ratio = await page.evaluate(() => {
    const r = document.querySelector("#theme-button").getBoundingClientRect();
    return r.width / r.height;
  });
  await click('button[title="Lock aspect ratio"]');
  await native(() => {
    const input = [...document.querySelectorAll("label.ui-field")]
      .find((e) => e.firstElementChild?.textContent === "Width")
      .querySelector("input");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, "160");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#theme-button").style.width === "160px",
  );
  assert.ok(
    Math.abs(
      (await page.evaluate(() =>
        parseFloat(document.querySelector("#theme-button").style.height),
      )) -
        160 / ratio,
    ) < 0.1,
  );
  await click('button[title="Link padding sides"]');
  await fill('input[aria-label="padding top"]', "9");
  await page.waitForFunction(
    () => document.querySelector("#theme-button").style.paddingBottom === "9px",
  );
  assert.deepEqual(
    await page.evaluate(() =>
      ["Top", "Right", "Bottom", "Left"].map(
        (side) =>
          document.querySelector("#theme-button").style["padding" + side],
      ),
    ),
    ["9px", "9px", "9px", "9px"],
  );
  console.log(
    "PASS linked aspect ratio and linked padding commands through native bridge",
  );

  const worker = (await task.cdp("Target.getTargets")).targetInfos.find(
    (t) =>
      t.type === "service_worker" &&
      t.url.startsWith(target.url.split("/").slice(0, 3).join("/")),
  );
  assert.ok(worker);
  assert.equal(
    (await task.cdp("Target.closeTarget", { targetId: worker.targetId }))
      .success,
    true,
  );
  const deadline = Date.now() + 6000;
  let replacement;
  while (Date.now() < deadline) {
    replacement = (await task.cdp("Target.getTargets")).targetInfos.find(
      (t) =>
        t.type === "service_worker" &&
        t.targetId !== worker.targetId &&
        t.url === worker.url,
    );
    if (replacement) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(replacement, "Worker must restart automatically");
  await wait(
    () => document.querySelector("textarea")?.value === "Reconnect draft",
  );
  await fill("textarea", "After worker restart");
  await click('button[title="Save annotation"]');
  await wait(() =>
    document.querySelector(".ui-count").textContent.startsWith("1 notes"),
  );
  await page.click("#theme-button");
  await wait(
    () => document.querySelector("textarea")?.value === "After worker restart",
  );
  console.log(
    "PASS actual worker termination, automatic reconnect, draft/style preservation and post-reconnect save",
  );

  const tabs = await native(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.map((t) => ({ id: t.id, active: t.active }));
  });
  assert.equal(tabs.length, 2, "Use an isolated two-tab test window");
  const main = tabs.find((t) => t.active).id,
    other = tabs.find((t) => !t.active).id;
  await native((id) => chrome.tabs.update(id, { active: true }), other);
  await wait(
    () =>
      document.body.innerText.includes("Page not connected") &&
      document.body.innerText.includes("Click the extension icon"),
  );
  assert.equal(
    await native(() => !!document.querySelector(".ui-editor")),
    false,
  );
  await native(() =>
    [...document.querySelectorAll("button")]
      .find((e) => e.textContent === "Retry connection")
      .click(),
  );
  await wait(() =>
    document.body.innerText.includes("Click the extension icon"),
  );
  await native((id) => chrome.tabs.update(id, { active: true }), main);
  await wait(
    () => document.querySelector("textarea")?.value === "After worker restart",
  );
  console.log(
    "PASS unauthorized-tab guidance, bounded retry, no cross-tab editor leakage and returning to original draft",
  );

  await click('button[title="Delete annotation"]');
  await wait(() =>
    document.querySelector(".ui-count").textContent.startsWith("0 notes"),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector("#theme-button").style.width,
    ),
    "",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          .shadowRoot.querySelectorAll(".ui-marker").length,
    ),
    0,
  );
  await page.reload();
  await page.waitForFunction(
    () =>
      !!document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        ?.shadowRoot.querySelector(".ui-layer"),
  );
  await wait(
    () =>
      !!document.querySelector(".ui-toolbar") &&
      !document.querySelector(".ui-editor"),
  );
  console.log(
    "PASS delete/restoration and page reload reconnect without another permission click",
  );
} finally {
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(
    () => {},
  );
  await task.cdp("Target.detachFromTarget", { sessionId }).catch(() => {});
}
