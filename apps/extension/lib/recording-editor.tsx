import React from "react";
import { Check, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RecordingAsset } from "./panel-protocol";

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
