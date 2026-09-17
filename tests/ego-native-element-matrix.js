// Real native extension matrix; requires activeTab permission on p1.
// Prefix with globalThis.uiHelperTestSpace and globalThis.uiHelperProjectRoot.
// Optionally set globalThis.uiHelperCaseStart / uiHelperCaseEnd for a batch.
// Pipe to ego-browser nodejs. Reports failures without stopping the matrix.
const task = await taskSpace(globalThis.uiHelperTestSpace);
const page = task.page("p1");
const fs = await import("node:fs/promises");
const { evaluateTarget } = await import(
  `${globalThis.uiHelperProjectRoot}/tests/native-browser-bridge.mjs`
);
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
const native = (fn) => evaluateTarget(task, target.targetId, fn);
await native(() =>
  [...document.querySelectorAll("button")]
    .find((e) => e.textContent === "Retry connection")
    ?.click(),
);
const cases = [
  ["Heading", "h1"],
  ["Paragraph", ".hero-copy"],
  ["Flex button", "#theme-button"],
  ["Flex text", ".type-large"],
  ["Grid swatch", ".swatch.coral"],
  ["Block card", ".glass-card"],
  ["Outer box", ".margin-demo"],
  ["Padding box", ".padding-demo"],
  ["Inner content box", ".content-demo"],
  ["Flex avatar", ".avatar"],
  ["Flex growing text group", ".profile-copy"],
  ["Flex column text", ".profile-copy strong"],
  ["Nested card", ".profile-card"],
  ["Grid list item", ".metrics li:first-child"],
  ["Grid panel", ".color-panel"],
  ["Grid navigation link", ".brand"],
  ["Centered grid card", ".motion-card"],
  ["Absolute decoration", ".orbit-two"],
  ["Canvas", "#demo-canvas"],
  ["Progress block", ".progress"],
  ["Inline emphasized text", "h1 em"],
];
const results = [];
async function drag(x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}
try {
  for (const [name, selector] of cases.slice(
    globalThis.uiHelperCaseStart ?? 0,
    globalThis.uiHelperCaseEnd ?? cases.length,
  )) {
    try {
      await page.goto("http://127.0.0.1:5173");
      await page.waitForFunction(() => document.fonts.status === "loaded");
      // Avoid testing coordinates while Chromium's smooth wheel scroll is moving.
      await page.evaluate(
        (selector) =>
          document
            .querySelector(selector)
            .scrollIntoView({ block: "center", behavior: "instant" }),
        selector,
      );
      await page.waitForFunction(
        () =>
          !!document
            .querySelector("ui-helper-root[data-ui-helper-owner]")
            ?.shadowRoot.querySelector(".ui-layer"),
      );
      await native(() =>
        document.querySelector('button[title="Inspect elements"]').click(),
      );
      const point = await page.evaluate((selector) => {
        const e = document.querySelector(selector),
          r = e.getBoundingClientRect();
        for (const fy of [0.1, 0.5, 0.9, 0.03, 0.97])
          for (const fx of [0.1, 0.5, 0.9, 0.03, 0.97]) {
            const x = r.x + r.width * fx,
              y = r.y + r.height * fy;
            if (
              y > 0 &&
              y < innerHeight - 10 &&
              document.elementFromPoint(x, y) === e
            )
              return { x, y };
          }
        return null;
      }, selector);
      if (!point) throw Error("No unobstructed point on target");
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction((selector) => {
        const selected = document
          .querySelector("ui-helper-root[data-ui-helper-owner]")
          ?.shadowRoot.querySelector(".ui-selected-box")
          ?.getBoundingClientRect();
        const target = document.querySelector(selector).getBoundingClientRect();
        return (
          selected &&
          Math.abs(selected.x - target.x) < 1 &&
          Math.abs(selected.y - target.y) < 1 &&
          Math.abs(selected.width - target.width) < 1
        );
      }, selector);
      // Store live DOM identities so text/classes shared by siblings cannot hide changes.
      await page.evaluate((selector) => {
        const target = document.querySelector(selector);
        window.matrixTarget = target;
        window.matrixNodes = [...document.querySelectorAll("body *")].filter(
          (e) =>
            !target.contains(e) &&
            !e.closest("ui-helper-root") &&
            !["SCRIPT", "STYLE"].includes(e.tagName) &&
            e.getClientRects().length,
        );
        window.matrixRect = (e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x + scrollX,
            y: r.y + scrollY,
            width: r.width,
            height: r.height,
          };
        };
        window.matrixBefore = window.matrixNodes.map((e) => ({
          rect: window.matrixRect(e),
          style: e.getAttribute("style"),
          name: `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className ? "." + String(e.className).trim().replaceAll(" ", ".") : ""}`,
          ancestor: e.contains(target),
        }));
        window.matrixTargetBefore = window.matrixRect(target);
      }, selector);
      async function differences() {
        return page.evaluate(() =>
          window.matrixNodes.flatMap((e, i) => {
            const a = window.matrixBefore[i],
              b = window.matrixRect(e);
            const changes = Object.keys(b)
              .filter((k) => Math.abs(b[k] - a.rect[k]) > 0.8)
              .map((k) => `${k}:${+(b[k] - a.rect[k]).toFixed(2)}`);
            return changes.length
              ? [{ name: a.name, ancestor: a.ancestor, changes }]
              : [];
          }),
        );
      }
      const movePoint = await page.evaluate(() => {
        const s = document.querySelector("ui-helper-root").shadowRoot,
          e = s.querySelector(".ui-element-transform"),
          r = e.getBoundingClientRect();
        for (const fy of [0.3, 0.7, 0.5])
          for (const fx of [0.3, 0.7, 0.5]) {
            const x = r.x + r.width * fx,
              y = r.y + r.height * fy;
            if (y > 0 && y < innerHeight - 10 && s.elementFromPoint(x, y) === e)
              return { x, y };
          }
        return null;
      });
      if (!movePoint) throw Error("Move surface obscured");
      await drag(movePoint.x, movePoint.y, 25, 15);
      const movement = await page.evaluate(() => {
        const a = window.matrixTargetBefore,
          b = window.matrixRect(window.matrixTarget);
        return { dx: b.x - a.x, dy: b.y - a.y };
      });
      const moveChanges = await differences();
      // Restore before independently testing size changes.
      await drag(movePoint.x + 25, movePoint.y + 15, -25, -15);
      const resizePoint = await page.evaluate(() => {
        const s = document.querySelector("ui-helper-root").shadowRoot;
        for (const handle of ["se", "ne", "sw", "nw"]) {
          const e = s.querySelector(`.ui-transform-${handle}`),
            r = e.getBoundingClientRect();
          const x = r.x + r.width / 2,
            y = r.y + r.height / 2;
          if (
            x > 45 &&
            x < innerWidth - 45 &&
            y > 30 &&
            y < innerHeight - 30 &&
            s.elementFromPoint(x, y) === e
          )
            return {
              x,
              y,
              visible: true,
              dx: handle.includes("w") ? -40 : 40,
              dy: handle.includes("n") ? -20 : 20,
            };
        }
        return { visible: false };
      });
      if (!resizePoint.visible)
        throw Error("Resize handle obscured or outside viewport");
      await drag(resizePoint.x, resizePoint.y, resizePoint.dx, resizePoint.dy);
      const resizeChanges = await differences();
      const size = await page.evaluate(() => {
        const a = window.matrixTargetBefore,
          b = window.matrixRect(window.matrixTarget);
        return { dw: b.width - a.width, dh: b.height - a.height };
      });
      await native(() =>
        [...document.querySelectorAll("button")]
          .find((e) => e.textContent === "Cancel")
          .click(),
      );
      const cancelChanges = await differences();
      const restored = await page.evaluate((selector) => {
        const current = window.matrixRect(window.matrixTarget);
        return (
          window.matrixTarget === document.querySelector(selector) &&
          !document.querySelector("[data-ui-helper-placeholder]") &&
          Object.keys(current).every(
            (key) =>
              Math.abs(current[key] - window.matrixTargetBefore[key]) < 0.8,
          )
        );
      }, selector);
      const result = {
        name,
        selector,
        movement,
        moveChanges,
        size,
        resizeChanges,
        cancelChanges,
        restored,
      };
      results.push(result);
      console.log(
        JSON.stringify({
          ...result,
          resizeChanges: result.resizeChanges.slice(0, 8),
          affectedByResize: result.resizeChanges.length,
        }),
      );
    } catch (error) {
      results.push({ name, selector, error: String(error) });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  const path = `/tmp/ui-helper-matrix-${globalThis.uiHelperCaseStart ?? 0}.json`;
  await fs.writeFile(path, JSON.stringify(results, null, 2));
  console.log({ resultsPath: path, cases: results.length });
  const failures = results.filter(
    (result) =>
      result.selector !== ".profile-copy" &&
      (result.error ||
        result.moveChanges.length ||
        result.resizeChanges.length ||
        result.cancelChanges.length ||
        !result.restored ||
        Math.abs(result.movement.dx - 25) > 0.8 ||
        Math.abs(result.movement.dy - 15) > 0.8 ||
        Math.abs(result.size.dw - 40) > 0.8 ||
        Math.abs(result.size.dh - 20) > 0.8),
  );
  if (failures.length)
    throw Error(
      `Failed cases: ${failures.map((result) => result.name).join(", ")}`,
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
