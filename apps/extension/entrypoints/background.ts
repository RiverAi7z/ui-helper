import type { PanelPortMessage } from "../lib/panel-protocol";
import { connectPage } from "../lib/connect-page";
import { handleRecordingRequest } from "../lib/background-recording";

export default defineBackground(() => {
  type Panel = {
    port: chrome.runtime.Port;
    windowId: number;
    tabId?: number;
    generation: number;
    visible: boolean;
  };
  const panels = new Set<Panel>();
  const fileRequests = new Map<
    string,
    {
      panel: Panel;
      respond: (result: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const post = (panel: Panel, message: unknown) => {
    try {
      panel.port.postMessage(message);
    } catch {
      /* Panel closed. */
    }
  };
  const setPageVisibility = (tabId: number, active: boolean) =>
    chrome.tabs
      .sendMessage(tabId, { type: "PANEL_VISIBILITY", active })
      .catch(() => undefined);

  const connectPanelToTab = async (panel: Panel, tabId: number) => {
    if (panel.tabId !== undefined && panel.tabId !== tabId)
      void setPageVisibility(panel.tabId, false);
    panel.tabId = tabId;
    const generation = ++panel.generation;
    if (!panel.visible) return;
    post(panel, { type: "PANEL_LOADING", tabId });
    try {
      const state = await connectPage({
        send: () =>
          chrome.tabs.sendMessage(
            tabId,
            { type: "PANEL_ATTACH" },
            { frameId: 0 },
          ),
        inject: () =>
          chrome.scripting.executeScript({
            target: { tabId },
            files: ["content-scripts/content.js"],
          }),
        current: () =>
          generation === panel.generation && panels.has(panel) && panel.visible,
      });
      post(panel, { type: "PANEL_STATE", tabId, state });
    } catch (error) {
      if (generation !== panel.generation) return;
      post(panel, {
        type: "PANEL_ERROR",
        tabId,
        error: `${error instanceof Error ? error.message : "Unable to connect"} Click the extension icon to grant access; browser-internal pages cannot be inspected.`,
      });
    }
  };

  chrome.action.onClicked.addListener((tab) => {
    // Must be invoked synchronously in the action gesture, before any await.
    void chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch(() => undefined);
    if (tab.id === undefined) return;
    for (const panel of panels) {
      if (panel.windowId === tab.windowId)
        void connectPanelToTab(panel, tab.id);
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "ui-helper-panel" || port.sender?.tab) return;
    const panel: Panel = { port, windowId: -1, generation: 0, visible: true };
    panels.add(panel);
    port.onMessage.addListener(
      (message: PanelPortMessage) => {
        if (message.type === "PANEL_HELLO" && message.windowId !== undefined) {
          panel.windowId = message.windowId;
          panel.visible = message.visible !== false;
          void chrome.tabs
            .query({ active: true, windowId: panel.windowId })
            .then(([tab]) => {
              if (tab?.id !== undefined)
                return connectPanelToTab(panel, tab.id);
            });
        } else if (
          message.type === "PANEL_COMMAND" &&
          message.command &&
          message.id
        ) {
          const { id, command } = message;
          const tabId = panel.tabId;
          if (tabId === undefined || message.tabId !== tabId) {
            post(panel, {
              type: "PANEL_RESULT",
              id,
              result: {
                ok: false,
                error: "The active tab changed. Try again.",
              },
            });
            return;
          }
          void chrome.tabs
            .sendMessage(tabId, { type: "PANEL_COMMAND", command })
            .then(
              (result) => post(panel, { type: "PANEL_RESULT", id, result }),
              () =>
                post(panel, {
                  type: "PANEL_RESULT",
                  id,
                  result: {
                    ok: false,
                    error:
                      "Page disconnected. Click the extension icon to reconnect.",
                  },
                }),
            );
        } else if (message.type === "PANEL_FILE_RESULT" && message.id) {
          const pending = fileRequests.get(message.id);
          if (pending?.panel !== panel) return;
          clearTimeout(pending.timer);
          fileRequests.delete(message.id);
          pending.respond(message.result);
        } else if (message.type === "PANEL_VISIBLE") {
          panel.visible = !!message.visible;
          if (panel.visible) {
            void chrome.tabs
              .query({ active: true, windowId: panel.windowId })
              .then(([tab]) => {
                if (tab?.id !== undefined)
                  return connectPanelToTab(panel, tab.id);
              });
          } else {
            panel.generation++;
            if (panel.tabId !== undefined)
              void setPageVisibility(panel.tabId, false);
          }
        }
      },
    );
    port.onDisconnect.addListener(() => {
      panels.delete(panel);
      panel.generation++;
      if (panel.tabId !== undefined) void setPageVisibility(panel.tabId, false);
      for (const [id, pending] of fileRequests) {
        if (pending.panel !== panel) continue;
        clearTimeout(pending.timer);
        fileRequests.delete(id);
        pending.respond({
          ok: false,
          error: "Sidebar closed before the GIF could be saved",
        });
      }
    });
  });

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    for (const panel of panels)
      if (panel.windowId === windowId) void connectPanelToTab(panel, tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status !== "complete") return;
    for (const panel of panels)
      if (panel.tabId === tabId) void connectPanelToTab(panel, tabId);
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target === "offscreen") return false;
    const tabId = sender.tab?.id;
    if (request.type === "PANEL_READY") {
      // Connection setup actively probes readiness; this notification is best effort.
      sendResponse({ ok: true });
      return false;
    }
    if (request.type === "PANEL_STATE") {
      if (sender.frameId === 0)
        for (const panel of panels)
          if (panel.tabId === tabId)
            post(panel, { type: "PANEL_STATE", tabId, state: request.state });
      sendResponse({ ok: true });
      return false;
    }
    if (request.type === "PANEL_SAVE_GIF") {
      const panel = [...panels].find((candidate) => candidate.tabId === tabId);
      if (!panel || sender.frameId !== 0) {
        sendResponse({
          ok: false,
          error:
            "Keep the recording tab and sidebar open until the GIF has been saved",
        });
        return false;
      }
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        fileRequests.delete(id);
        sendResponse({ ok: false, error: "Saving GIF timed out" });
      }, 60_000);
      fileRequests.set(id, { panel, respond: sendResponse, timer });
      post(panel, {
        type: "PANEL_SAVE_GIF",
        id,
        dataUrl: request.dataUrl,
        filename: request.filename,
      });
      return true;
    }
    if (request.type !== "START_RECORDING" && request.type !== "STOP_RECORDING")
      return false;
    void handleRecordingRequest(request, tabId).then(sendResponse);
    return true;
  });
});
