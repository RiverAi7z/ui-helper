import type {
  FeedbackAnnotation,
  RectSnapshot,
  StyleDelta,
} from "@ui-helper/shared";
import {
  STYLE_PROPERTIES,
  type StyleProperty,
} from "../../lib/style-properties";
import { isTextEditable, snapshotElement } from "./dom";
import { clearResizeSlot, isolateResizeLayout } from "./resize-layout";

interface OriginalStyle {
  value: string;
  priority: string;
}

export interface LocalAnnotation extends FeedbackAnnotation {
  element?: HTMLElement;
  originalInline: Partial<Record<StyleProperty, OriginalStyle>>;
  styles: Partial<Record<StyleProperty, string>>;
  originalText?: string;
  text?: string;
  saved: boolean;
  layoutIsolated?: boolean;
}

export function createElementAnnotation(
  element: HTMLElement,
  index: number,
): LocalAnnotation {
  const snapshot = snapshotElement(element);
  const originalInline: LocalAnnotation["originalInline"] = {};
  const styles: LocalAnnotation["styles"] = {};
  for (const property of STYLE_PROPERTIES) {
    originalInline[property] = {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    };
  }
  const editable = isTextEditable(element);
  return {
    id: crypto.randomUUID(),
    index,
    kind: "element",
    comment: "",
    target: snapshot,
    styleDeltas: [],
    artifactPaths: [],
    element,
    originalInline,
    styles,
    originalText: editable ? (element.textContent ?? "") : undefined,
    text: editable ? (element.textContent ?? "") : undefined,
    saved: false,
  };
}

export function createRegionAnnotation(
  region: RectSnapshot,
  index: number,
): LocalAnnotation {
  return {
    id: crypto.randomUUID(),
    index,
    kind: "region",
    comment: "",
    region: {
      ...region,
      pageX: region.x + window.scrollX,
      pageY: region.y + window.scrollY,
    },
    styleDeltas: [],
    artifactPaths: [],
    originalInline: {},
    styles: {},
    saved: false,
  };
}

export function normalizeRegion(
  start: { x: number; y: number },
  end: { x: number; y: number },
): RectSnapshot {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    pageX: x + window.scrollX,
    pageY: y + window.scrollY,
  };
}

export function restoreElementState(annotation: LocalAnnotation): void {
  if (!annotation.element) return;
  clearResizeSlot(annotation.element);
  for (const property of STYLE_PROPERTIES) {
    const original = annotation.originalInline[property];
    if (original?.value)
      annotation.element.style.setProperty(
        property,
        original.value,
        original.priority,
      );
    else annotation.element.style.removeProperty(property);
  }
  if (
    annotation.originalText !== undefined &&
    isTextEditable(annotation.element)
  )
    annotation.element.textContent = annotation.originalText;
}

export function applyStyles(
  element: HTMLElement,
  styles: LocalAnnotation["styles"],
  layoutIsolated = false,
): void {
  if (layoutIsolated) isolateResizeLayout(element);
  Object.entries(styles).forEach(([property, value]) => {
    if (value !== undefined)
      element.style.setProperty(property, value, "important");
  });
}

/** Preserve ordering: layout isolation/styles first, then the existing text guard. */
export function applyAnnotationEdits(
  element: HTMLElement,
  edits: Pick<LocalAnnotation, "styles" | "layoutIsolated" | "text">,
): void {
  applyStyles(element, edits.styles, edits.layoutIsolated);
  if (edits.text !== undefined && isTextEditable(element))
    element.textContent = edits.text;
}

export function styleDeltas(annotation: LocalAnnotation): StyleDelta[] {
  const deltas: StyleDelta[] = STYLE_PROPERTIES.flatMap((property) => {
    const before = annotation.target?.computedStyles[property] ?? "";
    const after = annotation.styles[property] ?? before;
    return before.trim() === after.trim() ? [] : [{ property, before, after }];
  });
  if (annotation.layoutIsolated) {
    deltas.unshift({
      property: "layout",
      before: "normal flow",
      after:
        "Preserve the original layout footprint while resizing; the editor uses an inert layout placeholder.",
    });
  }
  if (
    annotation.originalText !== undefined &&
    annotation.text !== undefined &&
    annotation.originalText !== annotation.text
  ) {
    deltas.unshift({
      property: "textContent",
      before: annotation.originalText,
      after: annotation.text,
    });
  }
  return deltas;
}
