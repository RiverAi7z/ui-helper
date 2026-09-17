import type {
  PageSnapshot,
  RectSnapshot,
  TargetSnapshot,
} from "@ui-helper/shared";

export const STYLE_PROPERTIES = [
  "display",
  "position",
  "left",
  "top",
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

export function rectSnapshot(rect: DOMRect): RectSnapshot {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    pageX: rect.x + window.scrollX,
    pageY: rect.y + window.scrollY,
  };
}

export function pageSnapshot(): PageSnapshot {
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()]) {
    if (/token|key|secret|auth|password|session/i.test(key))
      url.searchParams.set(key, "[redacted]");
  }
  return {
    url: url.toString(),
    title: document.title,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    capturedAt: new Date().toISOString(),
  };
}

export function snapshotElement(element: HTMLElement): TargetSnapshot {
  const computed = getComputedStyle(element);
  const computedStyles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [
      property,
      computed.getPropertyValue(property),
    ]),
  );
  return {
    tagName: element.tagName.toLowerCase(),
    selector: uniqueSelector(element),
    xpath: xpathFor(element),
    accessibleName: accessibleName(element),
    nearbyText: nearbyText(element),
    outerHTML: sanitizedOuterHTML(element),
    rect: rectSnapshot(element.getBoundingClientRect()),
    computedStyles,
  };
}

export function uniqueSelector(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && parts.length < 7) {
    let part = current.tagName.toLowerCase();
    const stableClasses = [...current.classList]
      .filter(
        (name) =>
          name.length < 64 &&
          !/^(active|hover|focus|selected|css-|sc-)|[0-9a-f]{6,}/i.test(name),
      )
      .slice(0, 2);
    if (stableClasses.length)
      part += stableClasses.map((name) => `.${CSS.escape(name)}`).join("");
    const parentElement: Element | null = current.parentElement;
    if (parentElement) {
      const peers = [...parentElement.children].filter(
        (child) => child.tagName === current!.tagName,
      );
      if (peers.length > 1)
        part += `:nth-of-type(${peers.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const candidate = parts.join(" > ");
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    } catch {
      // Continue with a more explicit ancestry path.
    }
    current = parentElement;
  }
  return parts.join(" > ");
}

function xpathFor(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(
          (item) => item.tagName === current!.tagName,
        )
      : [];
    parts.unshift(`${tag}[${Math.max(1, siblings.indexOf(current) + 1)}]`);
    current = current.parentElement;
  }
  return `/${parts.join("/")}`;
}

function accessibleName(element: HTMLElement): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 240);
  }
  return (
    element.getAttribute("aria-label") ??
    element.getAttribute("alt") ??
    element.getAttribute("title") ??
    element.innerText?.trim().replace(/\s+/g, " ").slice(0, 240) ??
    ""
  );
}

function nearbyText(element: HTMLElement): string {
  const parentText =
    element.parentElement?.innerText ?? element.innerText ?? "";
  return parentText.trim().replace(/\s+/g, " ").slice(0, 500);
}

function sanitizedOuterHTML(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("script, style, noscript")
    .forEach((node) => node.remove());
  clone.querySelectorAll("input, textarea, select").forEach((node) => {
    node.removeAttribute("value");
    node.textContent = "";
  });
  for (const node of [clone, ...clone.querySelectorAll("*")]) {
    for (const attribute of [...node.attributes]) {
      if (
        /token|secret|password|cookie|authorization|data-ui-helper/i.test(
          attribute.name,
        )
      )
        node.removeAttribute(attribute.name);
      if (/^(src|href)$/i.test(attribute.name)) {
        try {
          const value = new URL(attribute.value, location.href);
          value.search = "";
          node.setAttribute(attribute.name, value.toString());
        } catch {
          // Keep non-URL values.
        }
      }
    }
  }
  return clone.outerHTML.slice(0, 4000);
}

export function isTextEditable(element: HTMLElement): boolean {
  return element.children.length === 0 && Boolean(element.textContent?.trim());
}

export function colorToHex(value: string): string {
  const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}
