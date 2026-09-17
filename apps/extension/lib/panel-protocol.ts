import type { FeedbackAnnotation, RectSnapshot } from "@ui-helper/shared";
import type { StyleProperty } from "./style-properties";

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
  recordBarOpen: boolean;
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
        | "record-options-toggle"
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

/** Existing wire envelopes. These types add no runtime validation or new keys. */
export type PanelPortMessage =
  | { type: "PANEL_HELLO"; windowId?: number; visible?: boolean }
  | { type: "PANEL_VISIBLE"; visible?: boolean }
  | { type: "PANEL_PING" }
  | { type: "PANEL_COMMAND"; id?: string; tabId?: number; command?: PanelCommand }
  | { type: "PANEL_FILE_RESULT"; id?: string; result?: unknown };

export type WorkerPanelMessage =
  | { type: "PANEL_LOADING"; tabId: number }
  | { type: "PANEL_STATE"; tabId: number; state: PanelState }
  | { type: "PANEL_ERROR"; tabId: number; error: string }
  | { type: "PANEL_RESULT"; id: string; result?: CommandResult }
  | { type: "PANEL_SAVE_GIF"; id: string; dataUrl: string; filename: string };
