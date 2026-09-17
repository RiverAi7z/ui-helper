import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

function setup() {
  const operations = [];
  const api = loadTypeScript(
    new URL(
      "../apps/extension/entrypoints/content/annotations.ts",
      import.meta.url,
    ),
    {
      window: { scrollX: 100, scrollY: 200 },
      crypto: { randomUUID: () => "id" },
    },
    {
      "./resize-layout": {
        clearResizeSlot: (e) => operations.push(["clear", e]),
        isolateResizeLayout: (e) => operations.push(["isolate", e]),
      },
    },
  );
  let text = "Original";
  const values = new Map([
    ["color", ["red", "important"]],
    ["width", ["20px", ""]],
  ]);
  const element = {
    children: [],
    get textContent() {
      return text;
    },
    set textContent(value) {
      operations.push(["text", value]);
      text = value;
    },
    style: {
      setProperty(key, value, priority) {
        operations.push(["set", key, value, priority]);
        values.set(key, [value, priority]);
      },
      removeProperty(key) {
        operations.push(["remove", key]);
        values.delete(key);
      },
    },
  };
  return { ...api, operations, element, values };
}

test("apply edits isolates first, writes important styles, then edits leaf text", () => {
  const env = setup();
  env.applyAnnotationEdits(env.element, {
    styles: { width: "30px", color: undefined },
    layoutIsolated: true,
    text: "Edited",
  });
  assert.deepEqual(env.operations, [
    ["isolate", env.element],
    ["set", "width", "30px", "important"],
    ["text", "Edited"],
  ]);
  assert.deepEqual(env.values.get("color"), ["red", "important"]);
});

test("restore clears slots, restores original priorities, removes introduced styles, then restores text", () => {
  const env = setup();
  const annotation = {
    element: env.element,
    originalText: "Original",
    originalInline: {
      color: { value: "red", priority: "important" },
      width: { value: "20px", priority: "" },
    },
  };
  env.applyAnnotationEdits(env.element, {
    styles: { width: "30px", height: "40px" },
    text: "Edited",
  });
  env.operations.length = 0;
  env.restoreElementState(annotation);
  assert.deepEqual(env.operations[0], ["clear", env.element]);
  assert.deepEqual(env.operations.at(-1), ["text", "Original"]);
  assert.deepEqual(
    [...env.values],
    [
      ["color", ["red", "important"]],
      ["width", ["20px", ""]],
    ],
  );
  const count = env.operations.length;
  env.restoreElementState({ originalInline: {} });
  assert.equal(env.operations.length, count);
});

test("apply/restore preserve the existing non-leaf and empty-text guards", () => {
  const env = setup();
  env.element.children = [{}];
  env.applyAnnotationEdits(env.element, { styles: {}, text: "Changed" });
  assert.equal(env.element.textContent, "Original");
  env.element.children = [];
  env.applyAnnotationEdits(env.element, { styles: {}, text: "" });
  env.restoreElementState({
    element: env.element,
    originalInline: {},
    originalText: "Original",
  });
  assert.equal(env.element.textContent, ""); // Characterize; fixing this is not part of extraction.
});

test("cancel-style restoration can reapply a saved baseline without replacing the node", () => {
  const env = setup();
  const original = {
    element: env.element,
    originalInline: {},
    originalText: "Original",
  };
  env.restoreElementState(original);
  env.applyAnnotationEdits(env.element, {
    styles: { width: "25px" },
    text: "Saved",
    layoutIsolated: false,
  });
  assert.deepEqual(env.values.get("width"), ["25px", "important"]);
  assert.equal(env.element.textContent, "Saved");
  assert.equal(original.element, env.element);
});

test("region coordinates normalize reversed drags and include current scroll offsets", () => {
  const env = setup();
  const region = env.normalizeRegion({ x: 30, y: 40 }, { x: 10, y: 15 });
  assert.deepEqual(JSON.parse(JSON.stringify(region)), {
    x: 10,
    y: 15,
    width: 20,
    height: 25,
    pageX: 110,
    pageY: 215,
  });
  const annotation = env.createRegionAnnotation(
    { ...region, pageX: -1, pageY: -1 },
    3,
  );
  assert.equal(annotation.id, "id");
  assert.equal(annotation.index, 3);
  assert.equal(annotation.saved, false);
  assert.equal(annotation.region.pageX, 110);
  assert.equal(annotation.region.pageY, 215);
});
