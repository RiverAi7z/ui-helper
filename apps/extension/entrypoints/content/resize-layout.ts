import type { StyleProperty } from "../../lib/style-properties";

export type ResizeStyles = Partial<Record<StyleProperty, string>>;
const slots = new WeakMap<HTMLElement, HTMLElement>();

export function clearResizeSlot(element: HTMLElement): void {
  slots.get(element)?.remove();
  slots.delete(element);
}

/** Keep a non-interactive snapshot in flow; edit the real DOM node out of flow.
 * The slot's shadow tree avoids duplicate IDs, focus targets and page selectors.
 * The real node is never cloned/replaced, so its listeners and canvas survive.
 */
export function isolateResizeLayout(element: HTMLElement): ResizeStyles {
  if (slots.get(element)?.isConnected) return {};
  const computed = getComputedStyle(element);
  if (computed.position === "absolute" || computed.position === "fixed")
    return {};
  const bounds = element.getBoundingClientRect();
  const value = (key: string) =>
    parseFloat(computed.getPropertyValue(key)) || 0;
  const layoutWidth =
    computed.display === "inline"
      ? bounds.width
      : (parseFloat(computed.width) || element.offsetWidth) +
        (computed.boxSizing === "border-box"
          ? 0
          : value("padding-left") +
            value("padding-right") +
            value("border-left-width") +
            value("border-right-width"));
  const layoutHeight =
    computed.display === "inline"
      ? bounds.height
      : (parseFloat(computed.height) || element.offsetHeight) +
        (computed.boxSizing === "border-box"
          ? 0
          : value("padding-top") +
            value("padding-bottom") +
            value("border-top-width") +
            value("border-bottom-width"));
  const specifiedWidth = element.computedStyleMap?.().get("width")?.toString();
  const slot = document.createElement("ui-helper-resize-slot");
  slot.setAttribute("data-ui-helper-placeholder", "");
  slot.setAttribute("aria-hidden", "true");
  slot.inert = true;
  for (const key of computed)
    slot.style.setProperty(key, computed.getPropertyValue(key), "important");
  const shadow = slot.attachShadow({ mode: "open" });
  const hidden = document.createElement("style");
  hidden.textContent =
    ":host, * { visibility: hidden !important; pointer-events: none !important; }";
  shadow.append(hidden);
  const clone = (node: Node): Node | null => {
    if (!(node instanceof Element)) return node.cloneNode(false);
    // Never connect active embeds, scripts or custom elements from the page.
    if (/^(SCRIPT|STYLE|LINK|IFRAME|OBJECT|EMBED)$/.test(node.tagName))
      return null;
    const copy = document.createElement(node.tagName === "BR" ? "br" : "span");
    const css = getComputedStyle(node);
    for (const key of css)
      copy.style.setProperty(key, css.getPropertyValue(key), "important");
    for (const child of node.childNodes) {
      const next = clone(child);
      if (next) copy.append(next);
    }
    return copy;
  };
  for (const child of element.childNodes) {
    const next = clone(child);
    if (next) shadow.append(next);
  }
  // Descendants copy inline visibility:visible !important, which overrides
  // the shadow stylesheet. Hide the whole composited subtree, not just the host.
  slot.style.setProperty("opacity", "0", "important");
  slot.style.setProperty("visibility", "hidden", "important");
  slot.style.setProperty("pointer-events", "none", "important");
  slot.style.setProperty("animation", "none", "important");
  slot.style.setProperty("transition", "none", "important");
  // A replaced element's intrinsic ratio must not be recalculated from its new
  // width/height. The slot retains exactly the used border-box footprint.
  if (computed.display !== "inline") {
    slot.style.setProperty("box-sizing", "border-box", "important");
    slot.style.setProperty("width", `${layoutWidth}px`, "important");
    slot.style.setProperty("height", `${layoutHeight}px`, "important");
    // Preserve a percentage-sized replaced item's grid contribution. Turning
    // width:100% into a definite pixel width changes fractional track sizing.
    if (
      /^(CANVAS|IMG|VIDEO)$/.test(element.tagName) &&
      specifiedWidth?.endsWith("%")
    ) {
      slot.style.setProperty("width", specifiedWidth, "important");
      if (computed.minWidth === "auto")
        slot.style.setProperty("min-width", "0px", "important");
    }
  }
  const styles: ResizeStyles = {
    position: "absolute",
    left: "0px",
    top: "0px",
    right: "auto",
    bottom: "auto",
    width: `${layoutWidth}px`,
    height: `${layoutHeight}px`,
    "box-sizing": "border-box",
    "min-width": "0px",
    "min-height": "0px",
    "max-width": "none",
    "max-height": "none",
    // Margins stay on the slot; absolute offsets address the border box.
    "margin-left": "0px",
    "margin-right": "0px",
    "margin-top": "0px",
    "margin-bottom": "0px",
  };
  // Read all layout before changing the live DOM.
  element.before(slot);
  slots.set(element, slot);
  for (const [key, value] of Object.entries(styles))
    element.style.setProperty(key, value!, "important");
  const origin = element.getBoundingClientRect();
  const scaleX = origin.width / layoutWidth || 1;
  const scaleY = origin.height / layoutHeight || 1;
  styles.left = `${(bounds.left - origin.left) / scaleX}px`;
  styles.top = `${(bounds.top - origin.top) / scaleY}px`;
  element.style.setProperty("left", styles.left, "important");
  element.style.setProperty("top", styles.top, "important");
  return styles;
}
