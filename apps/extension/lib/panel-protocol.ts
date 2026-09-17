import type { FeedbackAnnotation, RectSnapshot } from "@ui-helper/shared";
import type { StyleProperty } from "../entrypoints/content/dom";

export type Mode = "idle" | "inspect" | "region" | "record-area";
export interface PanelAnnotation extends FeedbackAnnotation {
  styles: Partial<Record<StyleProperty, string>>;
  text?: string;
  textEditable: boolean;
  saved: boolean;
}
export interface RecordingAsset {
  id: string;
  relativePath: string;
  width: number;
  height: number;
  frames: number;
  comment: string;
  scope: "window" | "area";
  region?: RectSnapshot;
}
export interface PanelState {
  mode: Mode;
  count: number;
  recordings: RecordingAsset[];
  selected: PanelAnnotation | null;
  selectedRecordingId: string | null;
  recording: boolean;
  recordingSeconds: number;
  recordingLimit: number;
  previewEnabled: boolean;
  notice: string;
}
export type PanelCommand =
  | { type: "mode"; mode: Mode }
  | { type: "preview" }
  | { type: "comment"; id: string; value: string }
  | { type: "style"; id: string; property: StyleProperty; value: string }
  | { type: "text"; id: string; value: string }
  | { type: "save" | "cancel" | "delete"; id: string }
  | { type: "recording-comment"; id: string; value: string }
  | {
      type: "recording-save" | "recording-cancel" | "recording-delete";
      id: string;
    }
  | { type: "recording-limit"; value: number }
  | {
      type:
        | "record-window"
        | "record-stop"
        | "export"
        | "export-done"
        | "dismiss-notice";
    };

export interface CommandResult {
  ok: boolean;
  error?: string;
  text?: string;
}
