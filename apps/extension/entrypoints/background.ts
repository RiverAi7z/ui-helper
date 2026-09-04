import type { ExtensionRequest } from "@ui-helper/shared";

export default defineBackground(() => {
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_UI" });
    } catch {
      // Restricted pages and pages that have not finished loading cannot host the overlay.
    }
  });

  chrome.runtime.onMessage.addListener(
    (request: ExtensionRequest | { target?: string }, sender, sendResponse) => {
      if ((request as { target?: string }).target === "offscreen") return false;

      void (async () => {
        try {
          switch ((request as ExtensionRequest).type) {
            case "START_RECORDING": {
              const tabId = sender.tab?.id;
              if (tabId === undefined)
                throw new Error("No active tab is available for recording");
              await ensureOffscreenDocument();
              const streamId = await new Promise<string>((resolve, reject) => {
                chrome.tabCapture.getMediaStreamId(
                  { targetTabId: tabId },
                  (id) => {
                    const error = chrome.runtime.lastError;
                    if (error) reject(new Error(error.message));
                    else resolve(id);
                  },
                );
              });
              const result = await chrome.runtime.sendMessage({
                target: "offscreen",
                type: "START_CAPTURE",
                streamId,
                crop: (
                  request as Extract<
                    ExtensionRequest,
                    { type: "START_RECORDING" }
                  >
                ).crop,
              });
              sendResponse(result);
              break;
            }
            case "STOP_RECORDING": {
              const result = await chrome.runtime.sendMessage({
                target: "offscreen",
                type: "STOP_CAPTURE",
              });
              sendResponse(result);
              break;
            }
            default:
              sendResponse({ ok: false, error: "Unknown request" });
          }
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return true;
    },
  );
});

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Encode the user-requested current-tab recording as a GIF.",
  });
}
