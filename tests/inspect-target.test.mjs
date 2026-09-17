import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
class HTMLElement {
  constructor(document) {
    this.ownerDocument = document;
  }
  contains(target) {
    return target === this || target.parent === this;
  }
}
const { isInspectableElement } = loadTypeScript(
  new URL("../apps/extension/entrypoints/content/dom.ts", import.meta.url),
  { HTMLElement },
);

test("inspect excludes document roots and helper UI, but allows components", () => {
  const document = {};
  document.body = new HTMLElement(document);
  document.documentElement = new HTMLElement(document);
  const host = new HTMLElement(document);
  const control = new HTMLElement(document);
  control.parent = host;
  for (const target of [
    null,
    {},
    document.body,
    document.documentElement,
    host,
    control,
  ]) {
    assert.equal(isInspectableElement(target, host), false);
  }
  // Do not exclude ordinary containers just because they fill the viewport.
  assert.equal(isInspectableElement(new HTMLElement(document), host), true);
});
