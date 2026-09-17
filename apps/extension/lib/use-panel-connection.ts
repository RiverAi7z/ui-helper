import { useEffect, useRef, useState, type RefObject } from "react";
import { saveGifToDirectory } from "./panel-files";
import type {
  CommandResult,
  PanelCommand,
  PanelState,
  WorkerPanelMessage,
} from "./panel-protocol";

/** Port lifecycle only. The caller retains direct user-gesture file/clipboard UI. */
export function usePanelConnection(
  directoryRef: RefObject<FileSystemDirectoryHandle | null>,
) {
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
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const reconnectAttempts = useRef(0);
  const tabRef = useRef<number | undefined>(undefined);
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
    port.onMessage.addListener((message: WorkerPanelMessage) => {
      if (message.type === "PANEL_LOADING") {
        if (tabRef.current !== message.tabId) setState(null);
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

  const retryConnection = () => {
    setError("");
    reconnectAttempts.current = 0;
    setConnectionAttempt((value) => value + 1);
  };
  return { state, setState, error, setError, tabRef, command, retryConnection };
}
