import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Editor, RecordingEditor, Toolbar } from "../../lib/panel-components";
import { saveGifToDirectory, writeClipboard } from "../../lib/panel-files";
import type {
  CommandResult,
  PanelCommand,
  PanelState,
} from "../../lib/panel-protocol";
import "../content/style.css";
import "./style.css";

const portals = document.getElementById("ui-helper-portals")!;
type DirectoryWindow = Window & {
  showDirectoryPicker(options: {
    id: string;
    mode: "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
};

function SidePanel() {
  const [state, setState] = useState<PanelState | null>(null);
  const [error, setError] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  useEffect(() => {
    if (state || error) return;
    const timer = window.setTimeout(
      () =>
        setError(
          "Connection timed out. Refresh the page and click the extension icon, or retry below.",
        ),
      6000,
    );
    return () => window.clearTimeout(timer);
  }, [state, error, connectionAttempt]);
  const [busy, setBusy] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const reconnectAttempts = useRef(0);
  const tabRef = useRef<number | undefined>(undefined);
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const pending = useRef(
    new Map<
      string,
      {
        resolve: (result: CommandResult) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: "ui-helper-panel" });
    } catch {
      setError("Extension reloaded. Close and reopen the sidebar.");
      return;
    }
    setError("");
    portRef.current = port;
    const failPending = () => {
      for (const { resolve, timer } of pending.current.values()) {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: "Sidebar disconnected. Reopen UI Helper.",
        });
      }
      pending.current.clear();
    };
    port.onMessage.addListener((message) => {
      if (message.type === "PANEL_LOADING") {
        if (tabRef.current !== message.tabId) {
          setState(null);
        }
        tabRef.current = message.tabId;
        setError("");
      } else if (
        message.type === "PANEL_STATE" &&
        message.tabId === tabRef.current
      ) {
        reconnectAttempts.current = 0;
        setState(message.state);
        setError("");
      } else if (
        message.type === "PANEL_ERROR" &&
        message.tabId === tabRef.current
      ) {
        setState(null);
        setError(message.error);
      } else if (message.type === "PANEL_RESULT") {
        const request = pending.current.get(message.id);
        if (request) {
          clearTimeout(request.timer);
          pending.current.delete(message.id);
          request.resolve(
            message.result ?? { ok: false, error: "No response from page" },
          );
        }
      } else if (message.type === "PANEL_SAVE_GIF") {
        void (async () => {
          try {
            if (!directoryRef.current)
              throw new Error("Choose a project folder before recording");
            const relativePath = await saveGifToDirectory(
              directoryRef.current,
              message.dataUrl,
              message.filename,
            );
            port.postMessage({
              type: "PANEL_FILE_RESULT",
              id: message.id,
              result: { ok: true, relativePath },
            });
          } catch (error) {
            directoryRef.current = null;
            port.postMessage({
              type: "PANEL_FILE_RESULT",
              id: message.id,
              result: { ok: false, error: String(error) },
            });
          }
        })();
      }
    });
    port.onDisconnect.addListener(() => {
      if (disposed || portRef.current !== port) return;
      portRef.current = null;
      setState(null);
      failPending();
      const attempt = ++reconnectAttempts.current;
      if (attempt <= 3) {
        setError("");
        reconnectTimer = window.setTimeout(
          () => {
            if (!disposed) setConnectionAttempt((value) => value + 1);
          },
          250 * 2 ** (attempt - 1),
        );
      } else setError("Connection lost. Click Retry connection to reconnect.");
    });
    void chrome.windows.getCurrent().then((window) => {
      if (portRef.current === port)
        port.postMessage({
          type: "PANEL_HELLO",
          windowId: window.id,
          visible: !document.hidden,
        });
    });
    const onVisibility = () => {
      if (!document.hidden && !portRef.current) {
        reconnectAttempts.current = 0;
        setConnectionAttempt((value) => value + 1);
      } else if (portRef.current === port)
        port.postMessage({ type: "PANEL_VISIBLE", visible: !document.hidden });
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Port traffic keeps the MV3 worker alive while this panel owns a session.
    const heartbeat = window.setInterval(() => {
      if (portRef.current === port) port.postMessage({ type: "PANEL_PING" });
    }, 20_000);
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      failPending();
      if (portRef.current === port) portRef.current = null;
      port.disconnect();
    };
  }, [connectionAttempt]);

  const command = (
    value: PanelCommand,
    tabId = tabRef.current,
  ): Promise<CommandResult> => {
    if (!portRef.current || tabId === undefined)
      return Promise.resolve({ ok: false, error: "Connect a page first" });
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(id);
        resolve({ ok: false, error: "Page response timed out" });
      }, 120_000);
      pending.current.set(id, { resolve, timer });
      portRef.current!.postMessage({
        type: "PANEL_COMMAND",
        id,
        tabId,
        command: value,
      });
    });
  };
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
              onClick={() => {
                setError("");
                reconnectAttempts.current = 0;
                setConnectionAttempt((value) => value + 1);
              }}
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
