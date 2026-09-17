import React, { useEffect, useRef, useState } from "react";
import { AppWindow, GripVertical, Scan, Timer, X } from "lucide-react";
import { parseRecordingLimit } from "./recording-limit";

/** Page-owned floating recording controls, matching the v0.1.4 layout. */
export function RecordingOptions(props: {
  limit: number;
  onLimit: (value: number) => void;
  onClose: () => void;
  onWindow: () => void;
  onArea: () => void;
}) {
  const [input, setInput] = useState(String(props.limit));
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const clamp = (x: number, y: number) => {
    const rect = panel.current?.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - (rect?.width ?? 0))),
      y: Math.max(0, Math.min(y, window.innerHeight - (rect?.height ?? 0))),
    };
  };
  useEffect(() => {
    const resize = () =>
      setPosition((current) => (current ? clamp(current.x, current.y) : null));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const commit = () => {
    const value = parseRecordingLimit(input);
    setInput(String(value));
    props.onLimit(value);
  };
  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div
      ref={panel}
      className="ui-record-bar"
      style={
        position
          ? {
              left: position.x,
              top: position.y,
              transform: "none",
            }
          : undefined
      }
    >
      <button
        className="ui-panel-drag-handle"
        title="Move recording options"
        aria-label="Move recording options"
        onPointerDown={(event) => {
          if (event.button !== 0 || !panel.current) return;
          const rect = panel.current.getBoundingClientRect();
          drag.current = {
            id: event.pointerId,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          setPosition({ x: rect.left, y: rect.top });
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          setPosition(
            clamp(
              event.clientX - drag.current.x,
              event.clientY - drag.current.y,
            ),
          );
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <GripVertical size={15} />
      </button>
      <button
        className="ui-record-bar-close"
        title="Close recording options"
        aria-label="Close recording options"
        onClick={props.onClose}
      >
        <X size={14} />
      </button>
      <span className="ui-record-bar-divider" />
      <button
        className="ui-record-bar-option"
        onClick={() => {
          commit();
          props.onWindow();
        }}
      >
        <AppWindow size={18} />
        Window
      </button>
      <button
        className="ui-record-bar-option"
        onClick={() => {
          commit();
          props.onArea();
        }}
      >
        <Scan size={18} />
        Area
      </button>
      <label className="ui-record-bar-duration">
        <Timer size={18} />
        <span className="ui-record-bar-value">
          <input
            className="ui-record-bar-input"
            aria-label="Recording limit seconds"
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={input}
            onChange={(event) =>
              setInput(event.target.value.replace(/\D/g, "").slice(0, 2))
            }
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span className="ui-record-bar-unit">s</span>
        </span>
      </label>
    </div>
  );
}
