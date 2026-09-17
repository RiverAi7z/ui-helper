import type { ExtensionRequest } from "@ui-helper/shared";

/** Capture bridge only; routing, sender checks and async response lifetime stay
 * in the worker entry point. Keep the callback API's runtime.lastError handling.
 */
export async function handleRecordingRequest(
  request: ExtensionRequest,
  tabId?: number,
): Promise<unknown> {
  try {
    if (request.type === "START_RECORDING") {
      if (tabId === undefined)
        throw new Error("No active tab is available for recording");
      await ensureOffscreenDocument();
      const streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(id);
        });
      });
      return await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_CAPTURE",
        streamId,
        crop: request.crop,
      });
    }
    return await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "STOP_CAPTURE",
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Encode the user-requested current-tab recording as a GIF.",
  });
}
