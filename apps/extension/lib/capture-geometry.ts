import type { RecordingCrop } from "@ui-helper/shared";

const MAX_EDGE = 960;

/** Existing offscreen crop/letterbox math, independent of MediaStream/canvas.
 * Keep rounding and clamping order: changing edge handling is a separate fix.
 */
export function captureGeometry(
  videoWidth: number,
  videoHeight: number,
  crop?: RecordingCrop,
) {
  const viewportWidth = crop?.viewportWidth || videoWidth;
  const viewportHeight = crop?.viewportHeight || videoHeight;
  const sourceScale = Math.min(
    videoWidth / viewportWidth,
    videoHeight / viewportHeight,
  );
  const offsetX = Math.max(0, (videoWidth - viewportWidth * sourceScale) / 2);
  const offsetY = Math.max(0, (videoHeight - viewportHeight * sourceScale) / 2);
  const sourceRect = crop
    ? {
        x: Math.max(0, Math.round(offsetX + crop.x * sourceScale)),
        y: Math.max(0, Math.round(offsetY + crop.y * sourceScale)),
        width: Math.max(2, Math.round(crop.width * sourceScale)),
        height: Math.max(2, Math.round(crop.height * sourceScale)),
      }
    : { x: 0, y: 0, width: videoWidth, height: videoHeight };
  sourceRect.width = Math.min(sourceRect.width, videoWidth - sourceRect.x);
  sourceRect.height = Math.min(sourceRect.height, videoHeight - sourceRect.y);
  const outputScale = Math.min(
    1,
    MAX_EDGE / Math.max(sourceRect.width, sourceRect.height),
  );
  return {
    sourceRect,
    width: Math.max(2, Math.round((sourceRect.width * outputScale) / 2) * 2),
    height: Math.max(2, Math.round((sourceRect.height * outputScale) / 2) * 2),
  };
}
