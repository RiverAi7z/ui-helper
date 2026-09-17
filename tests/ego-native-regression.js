// Real loaded-extension regression. No Chrome messaging/capture stubs.
// Requires p1 on the test page and one real toolbar click granting activeTab.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const { evaluateTarget } = await import(
  `${globalThis.uiHelperProjectRoot}/tests/native-browser-bridge.mjs`
);
const assert = (await import("node:assert/strict")).default;
const targets = (await task.cdp("Target.getTargets")).targetInfos;
const panelTarget = targets.find(
  (t) =>
    t.url.endsWith("/sidepanel.html") &&
    t.url.startsWith("chrome-extension://"),
);
assert.ok(panelTarget, "Open UI Helper in the native browser sidebar first");
const { sessionId } = await task.cdp("Target.attachToTarget", {
  targetId: panelTarget.targetId,
  flatten: false,
});
let sequence = 1;
const sendCDP = (method, params) =>
  task.cdp("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({ id: sequence++, method, params }),
  });
// Ego hides browser-chrome panels while the agent space owns focus. Keep only
// this native view visible/focused for the duration of the test; restore below.
await sendCDP("Emulation.setFocusEmulationEnabled", { enabled: true });
const native = (fn, arg) => evaluateTarget(task, panelTarget.targetId, fn, arg);
const wait = (predicate) =>
  native(`() => new Promise((resolve,reject) => {
  const condition = ${predicate.toString()}; const started = Date.now();
  const timer = setInterval(() => {if(condition()){clearInterval(timer);resolve(true)}else if(Date.now()-started>5000){clearInterval(timer);reject(new Error('Native UI condition timed out: '+document.body.innerText.slice(0,250))) }},25);
})`);
const click = async (selector) => {
  const point = await native((selector) => {
    const e = document.querySelector(selector);
    if (!e) throw new Error("Missing " + selector);
    e.scrollIntoView({ block: "nearest" });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  await sendCDP("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await sendCDP("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await sendCDP("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...point,
  });
};
const fill = (selector, value) =>
  native(
    ({ selector, value }) => {
      const e = document.querySelector(selector);
      if (!e) throw new Error("Missing " + selector);
      const prototype =
        e instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(e, value);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, value },
  );
const fillField = (label, value) =>
  native(
    ({ label, value }) => {
      const field = [...document.querySelectorAll("label.ui-field")].find(
        (e) => e.firstElementChild?.textContent === label,
      );
      const input = field?.querySelector("input");
      if (!input) throw new Error("Missing field " + label);
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { label, value },
  );
const choose = async (label, value) => {
  await native(
    (label) =>
      [...document.querySelectorAll("label.ui-field")]
        .find((e) => e.firstElementChild?.textContent === label)
        .querySelector("[role=combobox]")
        .click(),
    label,
  );
  await wait(() => !!document.querySelector("[role=option]"));
  await native((value) => {
    const e = [...document.querySelectorAll("[role=option]")].find(
      (e) => e.textContent.trim() === value,
    );
    e.setAttribute("data-test-choice", "");
  }, value);
  await click("[data-test-choice]");
  await wait(() => !document.querySelector("[role=listbox]"));
};
const inspect = async (selector) => {
  await native(() => {
    const b = document.querySelector('button[title="Inspect elements"]');
    if (!b.classList.contains("ui-button-default")) b.click();
  });
  await page.click(selector);
  await wait(() => !!document.querySelector(".ui-editor"));
};
const cancel = async () => {
  await native(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Cancel")
      .click(),
  );
  await wait(() => !document.querySelector(".ui-editor"));
};
const reset = async () => {
  await page.keyboard.press("Escape");
  await wait(() => !document.querySelector(".ui-editor"));
};
const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < 1,
    `${label}: ${actual} != ${expected}`,
  );
try {
  await wait(() => !!document.querySelector(".ui-toolbar"));
  await page.waitForFunction(
    () =>
      !!document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        ?.shadowRoot.querySelector(".ui-layer"),
  );
  await reset();
  await page.evaluate(() =>
    document
      .querySelectorAll("#foreign-helper-fixture")
      .forEach((node) => node.remove()),
  );
  const originalBodyStyle = await page.evaluate(
    () => document.body.style.cssText,
  );
  await inspect("#theme-button");
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("dark")),
    false,
  );
  await fill("textarea", "Native saved note");
  await click('button[title="Save annotation"]');
  await wait(() => !document.querySelector(".ui-editor"));
  for (let i = 0; i < 2; i++) {
    await page.click("#theme-button");
    await wait(
      () => document.querySelector("textarea")?.value === "Native saved note",
    );
    await fill("textarea", "Discard this change");
    await cancel();
  }
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          .shadowRoot.querySelectorAll(".ui-marker").length,
    ),
    1,
  );
  console.log(
    "PASS real connection, selection suppression, unique annotations, save/reopen/cancel",
  );

  await inspect(".display-text");
  const original = await page.evaluate(() => ({
    text: document.querySelector(".display-text").textContent,
    style:
      document.querySelector(".display-text").getAttribute("style") || null,
  }));
  await fillField("Text", "Native text edit");
  await fillField("Opacity", "0.7");
  await fillField("Font size", "30");
  await fillField("Border radius", "8");
  await fillField("Border width", "3");
  await choose("Font weight", "600");
  await choose("Font", "Georgia, serif");
  await click(".ui-color-trigger");
  await wait(() => !!document.querySelector(".ui-color-popover"));
  await fill(".ui-color-popover input.ui-input", "#123456");
  await click(".ui-color-trigger");
  await wait(() => !document.querySelector(".ui-color-popover"));
  await fill('input[aria-label="padding top"]', "12");
  await fill('input[aria-label="margin left"]', "6");
  await page.waitForFunction(
    () => document.querySelector(".display-text").style.marginLeft === "6px",
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const e = document.querySelector(".display-text"),
        s = e.style;
      return {
        text: e.textContent,
        opacity: s.opacity,
        size: s.fontSize,
        radius: s.borderRadius,
        border: s.borderWidth,
        weight: s.fontWeight,
        font: s.fontFamily,
        color: s.color,
        padding: s.paddingTop,
        margin: s.marginLeft,
      };
    }),
    {
      text: "Native text edit",
      opacity: "0.7",
      size: "30px",
      radius: "8px",
      border: "3px",
      weight: "600",
      font: "Georgia, serif",
      color: "rgb(18, 52, 86)",
      padding: "12px",
      margin: "6px",
    },
  );
  await click('button[title="Hide style-change preview"]');
  await page.waitForFunction(
    () =>
      document.querySelector(".display-text").textContent ===
      "Design in context.",
  );
  await click('button[title="Show style-change preview"]');
  await page.waitForFunction(
    () =>
      document.querySelector(".display-text").textContent ===
      "Native text edit",
  );
  await cancel();
  assert.deepEqual(
    await page.evaluate(() => ({
      text: document.querySelector(".display-text").textContent,
      style:
        document.querySelector(".display-text").getAttribute("style") || null,
    })),
    original,
  );
  console.log(
    "PASS real text/color/font/weight/opacity/border/spacing editors, popovers, preview and restore",
  );

  await inspect("#theme-button");
  const measure = () =>
    page.evaluate(() => {
      const r = (e) => {
        const x = e.getBoundingClientRect();
        return { x: x.x, y: x.y, width: x.width, height: x.height };
      };
      return {
        target: r(document.querySelector("#theme-button")),
        sibling: r(document.querySelector("#pulse-button")),
        parent: r(document.querySelector("#theme-button").parentElement),
      };
    });
  const baseline = await measure();
  for (const handle of ["se", "nw", "e", "w", "n", "s", "ne", "sw"]) {
    const before = await measure();
    const point = await page.evaluate((handle) => {
      const r = document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        .shadowRoot.querySelector(".ui-transform-" + handle)
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, handle);
    const dx = handle.includes("w") ? -10 : handle.includes("e") ? 10 : 0,
      dy = handle.includes("n") ? -10 : handle.includes("s") ? 10 : 0;
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
    await page.mouse.up();
    const after = await measure();
    near(
      after.target.width,
      before.target.width + Math.abs(dx),
      handle + " width",
    );
    near(
      after.target.height,
      before.target.height + Math.abs(dy),
      handle + " height",
    );
    for (const key of ["x", "y", "width", "height"]) {
      near(after.sibling[key], baseline.sibling[key], "sibling " + key);
      near(after.parent[key], baseline.parent[key], "parent " + key);
    }
  }
  const beforeMove = (await measure()).target;
  await page.mouse.move(beforeMove.x + 20, beforeMove.y + 20);
  await page.mouse.down();
  await page.mouse.move(beforeMove.x + 40, beforeMove.y + 35, { steps: 8 });
  await page.mouse.up();
  const moved = (await measure()).target;
  near(moved.x, beforeMove.x + 20, "move x");
  near(moved.y, beforeMove.y + 15, "move y");
  await cancel();
  const restored = (await measure()).target;
  for (const key of ["x", "y", "width", "height"])
    near(restored[key], baseline.target[key], "restore " + key);
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll("ui-helper-resize-slot").length,
    ),
    0,
  );
  console.log(
    "PASS real move, all 8 resize handles, neighbor layout preservation, cancel/slot cleanup",
  );

  await inspect("#theme-button");
  const geometry = () =>
    native(() => {
      const b = document.querySelector(".ui-copy-button"),
        r = b.getBoundingClientRect();
      return {
        width: innerWidth,
        font: getComputedStyle(b).fontSize,
        buttonWidth: r.width,
        buttonHeight: r.height,
        centers: [...document.querySelectorAll(".ui-toolbar>button")].map(
          (e) => {
            const r = e.getBoundingClientRect();
            return r.y + r.height / 2;
          },
        ),
      };
    });
  const nativeBefore = await geometry();
  for (const zoom of [0.5, 2, 1]) {
    await native(async (zoom) => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      await chrome.tabs.setZoom(tab.id, zoom);
    }, zoom);
    await page.waitForFunction(() => {
      const h = document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          .shadowRoot.querySelector(".ui-selected-box"),
        r = document.querySelector("#theme-button").getBoundingClientRect(),
        s = h?.getBoundingClientRect();
      return s && Math.abs(s.x - r.x) < 1 && Math.abs(s.width - r.width) < 1;
    });
    const now = await geometry();
    assert.deepEqual(now, nativeBefore);
    assert.ok(now.centers.every((y) => Math.abs(y - now.centers[0]) < 1));
  }
  await cancel();
  assert.equal(
    await page.evaluate(() => document.body.style.cssText),
    originalBodyStyle,
  );
  console.log(
    "PASS actual browser zoom 50/100/200%, native panel dimensions unchanged, highlight alignment and single toolbar row",
  );

  await native(() => {
    document.querySelector('button[title="Annotate a region"]').click();
  });
  await page.mouse.move(800, 220);
  await page.mouse.down();
  await page.mouse.move(1000, 320, { steps: 8 });
  await page.mouse.up();
  await wait(
    () =>
      document.querySelector(".ui-editor-tag")?.textContent ===
      "Region annotation",
  );
  await fill("textarea", "Native region note");
  await click('button[title="Save annotation"]');
  await wait(() => !document.querySelector(".ui-editor"));
  await click(".ui-copy-button");
  await wait(
    () =>
      document.querySelector(".ui-count")?.textContent === "0 notes · 0 GIF",
  );
  // Production requests clipboardWrite only; inspect the test's OS clipboard
  // without adding a clipboardRead permission to the extension.
  const copied = (await import("node:child_process")).execFileSync(
    "/usr/bin/pbpaste",
    { encoding: "utf8" },
  );
  assert.ok(
    copied.includes("Native saved note") &&
      copied.includes("Native region note") &&
      copied.includes("#theme-button"),
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
  console.log("PASS real region annotation, clipboard content, copy/reset");

  // A foreign custom element must never suppress isolated-world initialization.
  await page.evaluate(() => {
    document.querySelector("ui-helper-root[data-ui-helper-owner]").remove();
    const fake = document.createElement("ui-helper-root");
    fake.id = "foreign-helper-fixture";
    document.documentElement.append(fake);
  });
  await native(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-scripts/content.js"],
    });
    for (let i = 0; i < 40; i++) {
      try {
        const r = await chrome.tabs.sendMessage(tab.id, {
          type: "PANEL_ATTACH",
        });
        if (r?.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Injected listener never became ready");
  });
  await page.waitForFunction(
    () =>
      !!document
        .querySelector("ui-helper-root[data-ui-helper-owner]")
        ?.shadowRoot.querySelector(".ui-layer"),
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector("#foreign-helper-fixture"),
    ),
    true,
  );
  await page.evaluate(() =>
    document.querySelector("#foreign-helper-fixture").remove(),
  );
  await native(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-scripts/content.js"],
    });
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll("ui-helper-root[data-ui-helper-owner]")
          .length,
    ),
    1,
  );
  console.log(
    "PASS foreign-host collision regression and repeat-injection idempotency",
  );
  console.log("REAL NATIVE CORE REGRESSION PASSED");
} finally {
  await native(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) await chrome.tabs.setZoom(tab.id, 1);
  }).catch(() => {});
  await sendCDP("Emulation.setFocusEmulationEnabled", { enabled: false });
  await task.cdp("Target.detachFromTarget", { sessionId });
}
