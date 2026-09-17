import React, { useRef } from "react";
import type { RectSnapshot } from "@ui-helper/shared";
import type { LocalAnnotation } from "./annotations";
import { isolateResizeLayout } from "./resize-layout";

type TransformHandle =
  "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function ElementTransform({
  rect,
  element,
  styles: savedStyles,
  layoutIsolated = false,
  onChange,
  onRestore,
}: {
  rect: RectSnapshot;
  element: HTMLElement;
  styles: LocalAnnotation["styles"];
  layoutIsolated?: boolean;
  onChange: (styles: LocalAnnotation["styles"], isolated: boolean) => void;
  onRestore: (styles: LocalAnnotation["styles"], isolated: boolean) => void;
}) {
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    handle: TransformHandle;
    width: number;
    height: number;
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
    position: string;
    isolated: boolean;
    originalIsolated: boolean;
    baseStyles: LocalAnnotation["styles"];
    original: LocalAnnotation["styles"];
  } | null>(null);

  const start = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: TransformHandle,
  ) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    const baseStyles = handle === "move" ? {} : isolateResizeLayout(element);
    const computed = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const number = (property: string) =>
      parseFloat(computed.getPropertyValue(property)) || 0;
    const borderBox = computed.boxSizing === "border-box";
    const width = parseFloat(computed.width);
    const height = parseFloat(computed.height);
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      handle,
      width: Number.isFinite(width)
        ? width
        : element.offsetWidth -
          (borderBox
            ? 0
            : number("padding-left") +
              number("padding-right") +
              number("border-left-width") +
              number("border-right-width")),
      height: Number.isFinite(height)
        ? height
        : element.offsetHeight -
          (borderBox
            ? 0
            : number("padding-top") +
              number("padding-bottom") +
              number("border-top-width") +
              number("border-bottom-width")),
      left: computed.position === "static" ? 0 : number("left"),
      top: computed.position === "static" ? 0 : number("top"),
      scaleX: Number.isFinite(width)
        ? bounds.width /
            (width +
              (borderBox
                ? 0
                : number("padding-left") +
                  number("padding-right") +
                  number("border-left-width") +
                  number("border-right-width"))) || 1
        : 1,
      scaleY: Number.isFinite(height)
        ? bounds.height /
            (height +
              (borderBox
                ? 0
                : number("padding-top") +
                  number("padding-bottom") +
                  number("border-top-width") +
                  number("border-bottom-width"))) || 1
        : 1,
      position: computed.position === "static" ? "relative" : computed.position,
      isolated: layoutIsolated || Object.keys(baseStyles).length > 0,
      originalIsolated: layoutIsolated,
      baseStyles,
      original: { ...savedStyles },
    };
    event.currentTarget
      .closest<HTMLElement>(".ui-element-transform")!
      .setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - current.x) / current.scaleX;
    const dy = (event.clientY - current.y) / current.scaleY;
    const { handle } = current;
    const styles: LocalAnnotation["styles"] = {
      ...current.baseStyles,
      position: current.position,
    };
    const px = (value: number) => `${Math.round(value * 100) / 100}px`;
    if (handle === "move") {
      styles.left = px(current.left + dx);
      styles.top = px(current.top + dy);
    } else {
      if (handle.includes("e") || handle.includes("w")) {
        const width = Math.max(
          1,
          current.width + (handle.includes("w") ? -dx : dx),
        );
        styles.width = px(width);
        if (handle.includes("w"))
          styles.left = px(current.left + current.width - width);
      }
      if (handle.includes("n") || handle.includes("s")) {
        const height = Math.max(
          1,
          current.height + (handle.includes("n") ? -dy : dy),
        );
        styles.height = px(height);
        if (handle.includes("n"))
          styles.top = px(current.top + current.height - height);
      }
    }
    onChange(styles, current.isolated);
  };
  return (
    <div
      className="ui-element-transform"
      title="Drag to move; drag handles to resize"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
      onPointerDown={(event) => start(event, "move")}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (gesture.current?.pointerId !== event.pointerId) return;
        move(event);
        gesture.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        if (gesture.current)
          onRestore(gesture.current.original, gesture.current.originalIsolated);
        gesture.current = null;
      }}
      onLostPointerCapture={() => {
        if (gesture.current)
          onRestore(gesture.current.original, gesture.current.originalIsolated);
        gesture.current = null;
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((handle) => (
        <div
          key={handle}
          className={`ui-transform-handle ui-transform-${handle}`}
          title={`Resize ${handle}`}
          onPointerDown={(event) => start(event, handle)}
        />
      ))}
    </div>
  );
}
