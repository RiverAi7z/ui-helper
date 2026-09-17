import React, { useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  MousePointer2,
  SquareDashedMousePointer,
  StopCircle,
  Trash2,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { colorToHex, type StyleProperty } from "../entrypoints/content/dom";
import type { Mode, PanelAnnotation, RecordingAsset } from "./panel-protocol";

export function Toolbar(props: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  recording: boolean;
  busy: boolean;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  onStopRecording: () => void;
  onExport: () => void;
  recordBarOpen: boolean;
  onToggleRecordBar: () => void;
}) {
  return (
    <div className="ui-toolbar">
      <Button
        title="Inspect elements"
        size="icon"
        variant={props.mode === "inspect" ? "default" : "ghost"}
        onClick={() =>
          props.setMode(props.mode === "inspect" ? "idle" : "inspect")
        }
      >
        <MousePointer2 size={17} />
      </Button>
      <Button
        title="Annotate a region"
        size="icon"
        variant={props.mode === "region" ? "default" : "ghost"}
        onClick={() =>
          props.setMode(props.mode === "region" ? "idle" : "region")
        }
      >
        <SquareDashedMousePointer size={17} />
      </Button>
      <Button
        title={
          props.previewEnabled
            ? "Hide style-change preview"
            : "Show style-change preview"
        }
        size="icon"
        variant="ghost"
        onClick={props.onTogglePreview}
      >
        {props.previewEnabled ? <Eye size={17} /> : <EyeOff size={17} />}
      </Button>
      {props.recording ? (
        <Button
          title="Stop GIF recording"
          size="icon"
          variant="destructive"
          onClick={props.onStopRecording}
        >
          <StopCircle size={17} />
        </Button>
      ) : (
        <>
          <Button
            title="Record a GIF"
            size="icon"
            variant={
              props.recordBarOpen || props.mode === "record-area"
                ? "default"
                : "ghost"
            }
            onClick={props.onToggleRecordBar}
          >
            <Video size={17} />
          </Button>
        </>
      )}
      <Button
        className="ui-copy-button"
        disabled={props.recording || props.busy}
        onClick={props.onExport}
      >
        <Copy size={16} /> Copy for AI
      </Button>
    </div>
  );
}

export function RecordingEditor(props: {
  recording: RecordingAsset;
  index: number;
  onComment: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="ui-editor ui-recording-editor">
      <div className="ui-editor-prompt ui-recording-editor-prompt">
        <Video size={18} className="ui-prompt-icon" />
        <Textarea
          autoFocus
          value={props.recording.comment}
          onChange={(event) => props.onComment(event.target.value)}
          placeholder="Describe what happens in this recording…"
          rows={4}
        />
      </div>
      <div className="ui-editor-title">
        <span className="ui-editor-tag">
          GIF {props.index} ·{" "}
          {props.recording.scope === "window" ? "Window" : "Area"}
        </span>
        <span className="ui-recording-meta">
          {props.recording.width}×{props.recording.height} ·{" "}
          {props.recording.frames} frames
        </span>
      </div>
      <div className="ui-recording-path" title={props.recording.relativePath}>
        @{props.recording.relativePath}
      </div>
      <div className="ui-editor-actions">
        <Button
          title="Remove recording from feedback (keeps local file)"
          aria-label="Delete recording"
          size="icon"
          variant="ghost"
          className="ui-danger-ghost"
          onClick={props.onDelete}
        >
          <Trash2 size={17} />
        </Button>
        <span className="ui-action-spacer" />
        <Button variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          size="icon"
          title="Save recording annotation"
          onClick={props.onSave}
        >
          <Check size={18} />
        </Button>
      </div>
    </div>
  );
}

export function Editor(props: {
  annotation: PanelAnnotation;
  portalContainer: HTMLElement;
  onComment: (value: string) => void;
  onStyle: (property: StyleProperty, value: string) => void;
  onText: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const { annotation } = props;
  const [expandedPadding, setExpandedPadding] = useState(false);
  const [expandedMargin, setExpandedMargin] = useState(false);
  const [dimensionsLinked, setDimensionsLinked] = useState(false);

  return (
    <div className="ui-editor">
      <div className="ui-editor-prompt">
        <Textarea
          value={annotation.comment}
          onChange={(event) => props.onComment(event.target.value)}
          placeholder="Describe these changes…"
          rows={1}
        />
      </div>
      <div className="ui-editor-title">
        <span className="ui-editor-tag">
          {annotation.kind === "element"
            ? annotation.target?.tagName
            : "Region annotation"}
        </span>
      </div>
      {annotation.kind === "element" && (
        <ScrollArea className="ui-editor-scroll">
          <div className="ui-fields">
            {annotation.textEditable && (
              <Field label="Text">
                <Input
                  value={annotation.text ?? ""}
                  onChange={(event) => props.onText(event.target.value)}
                />
              </Field>
            )}
            <ColorField
              label="Text color"
              value={valueOf(annotation, "color")}
              property="color"
              onChange={props.onStyle}
              portal={props.portalContainer}
            />
            <ColorField
              label="Background"
              value={valueOf(annotation, "background-color")}
              property="background-color"
              onChange={props.onStyle}
              portal={props.portalContainer}
            />
            <NumberField
              label="Opacity"
              value={valueOf(annotation, "opacity")}
              property="opacity"
              onChange={props.onStyle}
              step="0.05"
            />
            <div className="ui-section-label">Typography</div>
            <Field label="Font">
              <Select
                value={valueOf(annotation, "font-family")}
                onValueChange={(value) => props.onStyle("font-family", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent portalContainer={props.portalContainer}>
                  {[
                    valueOf(annotation, "font-family"),
                    "Inter, sans-serif",
                    "system-ui, sans-serif",
                    "Arial, sans-serif",
                    "Georgia, serif",
                    "monospace",
                  ]
                    .filter((value, index, all) => all.indexOf(value) === index)
                    .map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <PixelField
              label="Font size"
              value={valueOf(annotation, "font-size")}
              property="font-size"
              onChange={props.onStyle}
            />
            <Field label="Font weight">
              <Select
                value={valueOf(annotation, "font-weight")}
                onValueChange={(value) => props.onStyle("font-weight", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent portalContainer={props.portalContainer}>
                  {[
                    "100",
                    "200",
                    "300",
                    "400",
                    "500",
                    "600",
                    "700",
                    "800",
                    "900",
                  ].map((weight) => (
                    <SelectItem key={weight} value={weight}>
                      {weight}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="ui-section-label">Border</div>
            <PixelField
              label="Border radius"
              value={valueOf(annotation, "border-radius")}
              property="border-radius"
              onChange={props.onStyle}
            />
            <ColorField
              label="Border color"
              value={valueOf(annotation, "border-color")}
              property="border-color"
              onChange={props.onStyle}
              portal={props.portalContainer}
            />
            <PixelField
              label="Border width"
              value={valueOf(annotation, "border-width")}
              property="border-width"
              onChange={props.onStyle}
            />
            <div className="ui-section-label">Layout</div>
            <div className="ui-dimensions">
              <button
                className={dimensionsLinked ? "ui-link active" : "ui-link"}
                title="Lock aspect ratio"
                onClick={() => setDimensionsLinked(!dimensionsLinked)}
              >
                <Link2 size={14} />
              </button>
              <PixelField
                label="Width"
                value={valueOf(annotation, "width")}
                property="width"
                onChange={(property, value) => {
                  props.onStyle(property, value);
                  if (dimensionsLinked && annotation.target?.rect.width) {
                    props.onStyle(
                      "height",
                      `${(Number.parseFloat(value) * annotation.target.rect.height) / annotation.target.rect.width}px`,
                    );
                  }
                }}
              />
              <PixelField
                label="Height"
                value={valueOf(annotation, "height")}
                property="height"
                onChange={(property, value) => {
                  props.onStyle(property, value);
                  if (dimensionsLinked && annotation.target?.rect.height) {
                    props.onStyle(
                      "width",
                      `${(Number.parseFloat(value) * annotation.target.rect.width) / annotation.target.rect.height}px`,
                    );
                  }
                }}
              />
            </div>
            <SpacingFields
              kind="padding"
              expanded={expandedPadding}
              setExpanded={setExpandedPadding}
              annotation={annotation}
              onChange={props.onStyle}
            />
            <SpacingFields
              kind="margin"
              expanded={expandedMargin}
              setExpanded={setExpandedMargin}
              annotation={annotation}
              onChange={props.onStyle}
            />
          </div>
        </ScrollArea>
      )}
      <div className="ui-editor-actions">
        <Button
          title="Delete annotation"
          size="icon"
          variant="ghost"
          className="ui-danger-ghost"
          onClick={props.onDelete}
        >
          <Trash2 size={17} />
        </Button>
        <span className="ui-action-spacer" />
        <Button variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          title="Save annotation"
          aria-label="Save annotation"
          size="icon"
          onClick={props.onSave}
        >
          <Check size={18} />
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  );
}

function NumberField(props: {
  label: string;
  value: string;
  property: StyleProperty;
  onChange: (property: StyleProperty, value: string) => void;
  step?: string;
}) {
  return (
    <Field label={props.label}>
      <Input
        type="number"
        step={props.step}
        value={Number.parseFloat(props.value) || 0}
        onChange={(event) => props.onChange(props.property, event.target.value)}
      />
    </Field>
  );
}

function PixelField(props: {
  label: string;
  value: string;
  property: StyleProperty;
  onChange: (property: StyleProperty, value: string) => void;
}) {
  return (
    <Field label={props.label}>
      <div className="ui-unit-input">
        <Input
          type="number"
          step="0.5"
          value={Number.parseFloat(props.value) || 0}
          onChange={(event) =>
            props.onChange(props.property, `${event.target.value}px`)
          }
        />
        <span>px</span>
      </div>
    </Field>
  );
}

function ColorField(props: {
  label: string;
  value: string;
  property: StyleProperty;
  onChange: (property: StyleProperty, value: string) => void;
  portal: HTMLElement;
}) {
  return (
    <Field label={props.label}>
      <Popover>
        <PopoverTrigger asChild>
          <button className="ui-color-trigger">
            <span style={{ background: props.value }} />
            {props.value}
          </button>
        </PopoverTrigger>
        <PopoverContent
          portalContainer={props.portal}
          align="end"
          className="ui-color-popover"
        >
          <input
            type="color"
            value={colorToHex(props.value)}
            onChange={(event) =>
              props.onChange(props.property, event.target.value)
            }
          />
          <Input
            value={props.value}
            onChange={(event) =>
              props.onChange(props.property, event.target.value)
            }
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function SpacingFields(props: {
  kind: "padding" | "margin";
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  annotation: PanelAnnotation;
  onChange: (property: StyleProperty, value: string) => void;
}) {
  const sides = ["top", "right", "bottom", "left"] as const;
  const [linked, setLinked] = useState(false);
  const changeSide = (side: (typeof sides)[number], value: string) => {
    if (linked) {
      sides.forEach((linkedSide) =>
        props.onChange(`${props.kind}-${linkedSide}` as StyleProperty, value),
      );
    } else {
      props.onChange(`${props.kind}-${side}` as StyleProperty, value);
    }
  };
  return (
    <div className="ui-spacing">
      <div className="ui-spacing-heading">
        <button
          className="ui-spacing-toggle"
          onClick={() => props.setExpanded(!props.expanded)}
        >
          <span>{props.kind === "padding" ? "Padding" : "Margin"}</span>
          <span>{props.expanded ? "⌄" : "›"}</span>
        </button>
        <button
          className={linked ? "ui-link active" : "ui-link"}
          title={`Link ${props.kind} sides`}
          onClick={() => setLinked(!linked)}
        >
          <Link2 size={14} />
        </button>
      </div>
      {!props.expanded ? (
        <div className="ui-spacing-row">
          {sides.map((side) => {
            const property = `${props.kind}-${side}` as StyleProperty;
            return (
              <Input
                key={side}
                aria-label={`${props.kind} ${side}`}
                type="number"
                value={
                  Number.parseFloat(valueOf(props.annotation, property)) || 0
                }
                onChange={(event) =>
                  changeSide(side, `${event.target.value}px`)
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="ui-spacing-expanded">
          {sides.map((side) => {
            const property = `${props.kind}-${side}` as StyleProperty;
            return (
              <PixelField
                key={side}
                label={side[0].toUpperCase() + side.slice(1)}
                value={valueOf(props.annotation, property)}
                property={property}
                onChange={(_, value) => changeSide(side, value)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function valueOf(annotation: PanelAnnotation, property: StyleProperty): string {
  return (
    annotation.styles[property] ??
    annotation.target?.computedStyles[property] ??
    ""
  );
}
