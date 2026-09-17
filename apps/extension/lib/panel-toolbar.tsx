import React from "react";
import {
  Copy,
  Eye,
  EyeOff,
  MousePointer2,
  SquareDashedMousePointer,
  StopCircle,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Mode } from "./panel-protocol";

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
        <Copy size={17} /> Copy for AI
      </Button>
    </div>
  );
}
