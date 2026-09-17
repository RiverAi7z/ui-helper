import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Editor, RecordingEditor, Toolbar } from "../../lib/panel-components";
import { writeClipboard } from "../../lib/panel-files";
import { usePanelConnection } from "../../lib/use-panel-connection";
import type { PanelCommand } from "../../lib/panel-protocol";
import "../../lib/styles/index.css";
import "./style.css";

const portals = document.getElementById("ui-helper-portals")!;
type DirectoryWindow = Window & {
  showDirectoryPicker(options: {
    id: string;
    mode: "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
};

function SidePanel() {
  const [busy, setBusy] = useState(false);
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const { state, setState, error, setError, tabRef, command, retryConnection } =
    usePanelConnection(directoryRef);
  const send = (value: PanelCommand) => {
    // Keep typing responsive while the DOM-owning content script applies edits.
    setState((current) => {
      if (!current) return current;
      if (value.type === "recording-comment") {
        return {
          ...current,
          recordings: current.recordings.map((recording) =>
            recording.id === value.id
              ? { ...recording, comment: value.value }
              : recording,
          ),
        };
      }
      if (
        current.selected &&
        "id" in value &&
        value.id === current.selected.id
      ) {
        const selected = { ...current.selected };
        if (value.type === "comment") selected.comment = value.value;
        if (value.type === "text") selected.text = value.value;
        if (value.type === "style")
          selected.styles = {
            ...selected.styles,
            [value.property]: value.value,
          };
        return { ...current, selected };
      }
      return current;
    });
    void command(value).then((result) => {
      if (!result.ok) setError(result.error ?? "Action failed");
    });
  };
  const toggleRecordingOptions = async () => {
    if (busy) return;
    if (state?.recordBarOpen) {
      send({ type: "record-options-toggle" });
      return;
    }
    const tabId = tabRef.current;
    setBusy(true);
    setError("");
    try {
      // Native file pickers need this panel's direct click gesture. Handles stay
      // in this extension document and never cross JSON message boundaries.
      if (!directoryRef.current)
        directoryRef.current = await (
          window as unknown as DirectoryWindow
        ).showDirectoryPicker({ id: "ui-helper-project", mode: "readwrite" });
      if (tabId !== tabRef.current)
        throw new Error("The active tab changed. Start recording again.");
      const result = await command({ type: "record-options-toggle" }, tabId);
      if (!result.ok) throw new Error(result.error);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    const tabId = tabRef.current;
    setBusy(true);
    setError("");
    try {
      const result = await command({ type: "export" }, tabId);
      if (!result.ok || !result.text)
        throw new Error(result.error ?? "Nothing to copy");
      await writeClipboard(result.text);
      // Clear only after successful clipboard writing, and only in the source tab.
      const completed = await command({ type: "export-done" }, tabId);
      if (!completed.ok) throw new Error(completed.error);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const selected = state?.selected;
  const selectedRecording = state?.recordings.find(
    (item) => item.id === state.selectedRecordingId,
  );

  return (
    <aside className="ui-sidebar" aria-label="UI Helper">
      <header className="ui-sidebar-header">
        {state && (
          <span className="ui-count">
            {state.count} notes · {state.recordings.length} GIF
          </span>
        )}
        {state?.recording && (
          <span className="ui-timer">
            <i />
            {Math.max(0, state.recordingLimit - state.recordingSeconds)}s
          </span>
        )}
      </header>
      {state ? (
        <>
          <Toolbar
            mode={state.mode}
            setMode={(mode) => send({ type: "mode", mode })}
            recording={state.recording}
            previewEnabled={state.previewEnabled}
            onTogglePreview={() => send({ type: "preview" })}
            onStopRecording={() => send({ type: "record-stop" })}
            onExport={copy}
            busy={busy}
            recordBarOpen={state.recordBarOpen}
            onToggleRecordBar={() => void toggleRecordingOptions()}
          />
          {selectedRecording && !state.recording && (
            <RecordingEditor
              key={selectedRecording.id}
              recording={selectedRecording}
              index={state.recordings.indexOf(selectedRecording) + 1}
              onComment={(value) =>
                send({
                  type: "recording-comment",
                  id: selectedRecording.id,
                  value,
                })
              }
              onSave={() =>
                send({ type: "recording-save", id: selectedRecording.id })
              }
              onCancel={() =>
                send({ type: "recording-cancel", id: selectedRecording.id })
              }
              onDelete={() =>
                send({ type: "recording-delete", id: selectedRecording.id })
              }
            />
          )}
          {selected && !selectedRecording && (
            <Editor
              key={selected.id}
              annotation={selected}
              portalContainer={portals}
              onComment={(value) =>
                send({ type: "comment", id: selected.id, value })
              }
              onText={(value) => send({ type: "text", id: selected.id, value })}
              onStyle={(property, value) =>
                send({ type: "style", id: selected.id, property, value })
              }
              onSave={() => send({ type: "save", id: selected.id })}
              onCancel={() => send({ type: "cancel", id: selected.id })}
              onDelete={() => send({ type: "delete", id: selected.id })}
            />
          )}
          {!selected && !selectedRecording && (
            <div className="ui-sidebar-empty">
              <MousePointer2 size={28} />
              <strong>Select an element to edit</strong>
              <p>
                Inspect an element, annotate a region, or record a GIF to get
                started.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="ui-sidebar-empty">
          <MousePointer2 size={28} />
          <strong>
            {error ? "Page not connected" : "Connecting to page…"}
          </strong>
          <p>Open a web page and click the UI Helper extension icon.</p>
          {error && (
            <Button
              variant="secondary"
              onClick={retryConnection}
            >
              Retry connection
            </Button>
          )}
        </div>
      )}
      {(error || state?.notice) && (
        <button
          className="ui-notice"
          onClick={() => {
            setError("");
            if (state) send({ type: "dismiss-notice" });
          }}
        >
          {error || state?.notice}
          <X size={14} />
        </button>
      )}
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(<SidePanel />);
