/** Shared editor metadata; no content-script or browser runtime dependencies. */
export const STYLE_PROPERTIES = [
  "display",
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "box-sizing",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "color",
  "background-color",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "border-radius",
  "border-color",
  "border-width",
  "width",
  "height",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
] as const;

export type StyleProperty = (typeof STYLE_PROPERTIES)[number];

export function colorToHex(value: string): string {
  const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}
