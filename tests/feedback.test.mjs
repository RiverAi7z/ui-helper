import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const library = (file, globals) =>
  loadTypeScript(
    new URL(`../apps/extension/lib/${file}.ts`, import.meta.url),
    globals,
  );
const { buildMarkdown, sessionId } = library("feedback-markdown", {
  Date: class extends Date {
    constructor() {
      super("2026-09-17T12:34:56.789Z");
    }
  },
  crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789abc" },
});
const { styleDeltas } = loadTypeScript(
  new URL(
    "../apps/extension/entrypoints/content/annotations.ts",
    import.meta.url,
  ),
);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Markdown preserves annotation numbering, delta order, regions and GIF references", () => {
  const annotation = {
    index: 2,
    comment: "Make it clearer",
    target: {
      selector: "#title",
      outerHTML: '  <h1 id="title">  Before  </h1>  ',
      computedStyles: { color: "rgb(0, 0, 0)", width: "100px", opacity: "1" },
    },
    styles: { color: "#ffffff", width: "150px", opacity: " 1 " },
    layoutIsolated: true,
    originalText: "Before",
    text: "After",
  };
  annotation.styleDeltas = styleDeltas(annotation);
  assert.deepEqual(
    plain(annotation.styleDeltas).map((d) => d.property),
    ["textContent", "layout", "color", "width"],
  );
  const region = { pageX: 10.5, pageY: 20.6, width: 30.5, height: 40.9 };
  const session = {
    page: { url: "http://localhost:5173/?token=%5Bredacted%5D" },
    annotations: [annotation, { index: 4, comment: "Align this area", region }],
  };
  const recordings = [
    {
      relativePath: ".ui-helper/recordings/window.gif",
      comment: "Motion problem",
    },
    { relativePath: ".ui-helper/recordings/area.gif", comment: "", region },
  ];
  const before = JSON.stringify({ session, recordings });
  assert.equal(
    buildMarkdown(session, recordings),
    readFileSync(
      new URL("./fixtures/feedback.md", import.meta.url),
      "utf8",
    ).trimEnd(),
  );
  assert.equal(JSON.stringify({ session, recordings }), before);
});

test("unchanged styles/text produce no deltas; empty text and explicit empty styles remain changes", () => {
  assert.deepEqual(
    plain(styleDeltas({ styles: {}, target: { computedStyles: {} } })),
    [],
  );
  assert.deepEqual(
    plain(
      styleDeltas({
        styles: { color: "" },
        target: { computedStyles: { color: "red" } },
        originalText: "Before",
        text: "",
      }),
    ),
    [
      { property: "textContent", before: "Before", after: "" },
      { property: "color", before: "red", after: "" },
    ],
  );
});

test("formatter supports an explicit compactor and adds no trailing newline", () => {
  const calls = [];
  assert.equal(
    buildMarkdown(
      {
        page: { url: "about:blank" },
        annotations: [
          {
            index: 1,
            target: { selector: "p", outerHTML: "source" },
            styleDeltas: [],
          },
        ],
      },
      [],
      (html) => {
        calls.push(html);
        return "compact";
      },
    ),
    "# UI feedback\n\nPage: about:blank\n\n## 1. `p`\n```html\ncompact\n```",
  );
  assert.deepEqual(calls, ["source"]);
  assert.equal(sessionId(), "20260917123456-12345678");
});

test("compactHtml keeps the 800-character boundary without invoking the DOM", () => {
  const { compactHtml } = library("compact-html");
  assert.equal(
    compactHtml("  <p> hi </p> \n <p>there</p>  "),
    "<p> hi </p><p>there</p>",
  );
  assert.equal(compactHtml("a".repeat(800)), "a".repeat(800));
});

test("compactHtml preserves shallow markup and truncates long text at 240 characters", () => {
  let source;
  const shallow = {
    textContent: "",
    get outerHTML() {
      return `<p id="x">${this.textContent}</p>`;
    },
  };
  const { compactHtml } = library("compact-html", {
    document: {
      createElement(tag) {
        assert.equal(tag, "template");
        return {
          set innerHTML(value) {
            source = value;
          },
          content: {
            firstElementChild: {
              textContent: " " + "x".repeat(241) + " ",
              cloneNode(deep) {
                assert.equal(deep, false);
                return shallow;
              },
            },
          },
        };
      },
    },
  });
  assert.equal(
    compactHtml("<p>" + "x".repeat(900) + "</p>"),
    `<p id="x">${"x".repeat(237)}...</p>`,
  );
  assert.ok(source.length > 800);
});

test("compactHtml retains the no-element fallback", () => {
  const { compactHtml } = library("compact-html", {
    document: {
      createElement: () => ({ content: { firstElementChild: null } }),
    },
  });
  assert.equal(compactHtml("x".repeat(801)), "x".repeat(797) + "...");
});

test("style metadata order and existing color fallback/conversion stay stable", () => {
  const { STYLE_PROPERTIES, colorToHex } = library("style-properties");
  assert.equal(
    STYLE_PROPERTIES.join(","),
    "display,position,left,top,right,bottom,box-sizing,min-width,min-height,max-width,max-height,color,background-color,opacity,font-family,font-size,font-weight,border-radius,border-color,border-width,width,height,flex-grow,flex-shrink,flex-basis,padding-top,padding-right,padding-bottom,padding-left,margin-top,margin-right,margin-bottom,margin-left",
  );
  for (const [input, expected] of [
    ["rgb(255, 16, 0)", "#ff1000"],
    ["rgba(1, 2, 3, 0.5)", "#010203"],
    ["rgb(1 2 3)", "#010203"],
    ["#ABCDEF", "#ABCDEF"],
    ["transparent", "#000000"],
    ["#fff", "#000000"],
  ])
    assert.equal(colorToHex(input), expected);
  const legacy = loadTypeScript(
    new URL("../apps/extension/entrypoints/content/dom.ts", import.meta.url),
  );
  assert.deepEqual(plain(legacy.STYLE_PROPERTIES), plain(STYLE_PROPERTIES));
  assert.equal(legacy.colorToHex("rgb(1, 2, 3)"), "#010203");
});
