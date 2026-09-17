import React from "react";
import type { RectSnapshot } from "@ui-helper/shared";

export function Box({
  rect,
  className,
}: {
  rect: RectSnapshot;
  className: string;
}) {
  return (
    <div
      className={className}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

export function InspectorTip({
  element,
  rect,
}: {
  element: HTMLElement;
  rect: DOMRect;
}) {
  const computed = getComputedStyle(element);
  const top =
    rect.top > 95
      ? rect.top - 88
      : Math.min(window.innerHeight - 88, rect.bottom + 8);
  return (
    <div
      className="ui-inspector-tip"
      style={{
        left: Math.max(8, Math.min(window.innerWidth - 300, rect.left)),
        top,
      }}
    >
      <div>
        <strong>{element.tagName.toLowerCase()}</strong>
        <span>
          {Math.round(rect.width)}×{Math.round(rect.height)}
        </span>
      </div>
      <div>
        <span>color</span>
        <strong>{computed.color}</strong>
      </div>
      <div>
        <span>font</span>
        <strong>
          {computed.fontSize} {computed.fontFamily}
        </strong>
      </div>
    </div>
  );
}
