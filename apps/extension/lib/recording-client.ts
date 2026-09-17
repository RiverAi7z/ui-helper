import type { RectSnapshot } from "@ui-helper/shared";
import type { RecordingAsset } from "./panel-protocol";

/** Message/file workflow only. The content controller keeps selection and draft
 * ownership, and checks the current selection after this asynchronous work ends.
 */
export async function encodeAndSaveRecording(
  scope: "window" | "area",
  region?: RectSnapshot,
): Promise<{ ok: true; asset: RecordingAsset } | { ok: false; error: string }> {
  const response = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  if (!response?.ok)
    return { ok: false, error: response?.error ?? "Unable to encode GIF" };

  const filename = `recording-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${crypto.randomUUID().slice(0, 6)}.gif`;
  const saved = await chrome.runtime.sendMessage({
    type: "PANEL_SAVE_GIF",
    dataUrl: response.dataUrl,
    filename,
  });
  if (!saved?.ok)
    return {
      ok: false,
      error:
        saved?.error ??
        "Unable to save GIF. Keep the sidebar open while recording.",
    };
  return {
    ok: true,
    asset: {
      id: crypto.randomUUID(),
      relativePath: saved.relativePath as string,
      width: response.width,
      height: response.height,
      frames: response.frames,
      comment: "",
      scope,
      region,
    },
  };
}
