import type { RecordingCrop } from "@ui-helper/shared";
import { GIFEncoder, applyPalette, quantize } from "gifenc";

const FPS = 6;
const FRAME_DELAY = 1000 / FPS;
const MAX_EDGE = 960;

let stream: MediaStream | null = null;
let timer: number | null = null;
let video: HTMLVideoElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let encoder: ReturnType<typeof GIFEncoder> | null = null;
let frameCount = 0;
let captureBusy = false;
let sourceRect: { x: number; y: number; width: number; height: number } | null =
  null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  void (async () => {
    try {
      if (message.type === "START_CAPTURE") {
        await startCapture(
          message.streamId as string,
          message.crop as RecordingCrop | undefined,
        );
        sendResponse({ ok: true });
      } else if (message.type === "STOP_CAPTURE") {
        sendResponse(await stopCapture());
      }
    } catch (error) {
      await reset();
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return true;
});

async function startCapture(
  streamId: string,
  crop?: RecordingCrop,
): Promise<void> {
  await reset();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
  });

  video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  const viewportWidth = crop?.viewportWidth || video.videoWidth;
  const viewportHeight = crop?.viewportHeight || video.videoHeight;
  const sourceScale = Math.min(
    video.videoWidth / viewportWidth,
    video.videoHeight / viewportHeight,
  );
  const offsetX = Math.max(
    0,
    (video.videoWidth - viewportWidth * sourceScale) / 2,
  );
  const offsetY = Math.max(
    0,
    (video.videoHeight - viewportHeight * sourceScale) / 2,
  );
  sourceRect = crop
    ? {
        x: Math.max(0, Math.round(offsetX + crop.x * sourceScale)),
        y: Math.max(0, Math.round(offsetY + crop.y * sourceScale)),
        width: Math.max(2, Math.round(crop.width * sourceScale)),
        height: Math.max(2, Math.round(crop.height * sourceScale)),
      }
    : { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
  sourceRect.width = Math.min(
    sourceRect.width,
    video.videoWidth - sourceRect.x,
  );
  sourceRect.height = Math.min(
    sourceRect.height,
    video.videoHeight - sourceRect.y,
  );

  const outputScale = Math.min(
    1,
    MAX_EDGE / Math.max(sourceRect.width, sourceRect.height),
  );
  canvas = document.createElement("canvas");
  canvas.width = Math.max(
    2,
    Math.round((sourceRect.width * outputScale) / 2) * 2,
  );
  canvas.height = Math.max(
    2,
    Math.round((sourceRect.height * outputScale) / 2) * 2,
  );
  encoder = GIFEncoder();
  frameCount = 0;
  timer = window.setInterval(captureFrame, FRAME_DELAY);
  captureFrame();
}

function captureFrame(): void {
  if (
    !video ||
    !canvas ||
    !encoder ||
    !sourceRect ||
    captureBusy ||
    video.readyState < 2
  )
    return;
  captureBusy = true;
  try {
    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(
      video,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = new Uint8Array(
      rgba.buffer,
      rgba.byteOffset,
      rgba.byteLength,
    );
    const palette = quantize(pixels, 256, { format: "rgb444" });
    const indexed = applyPalette(pixels, palette, "rgb444");
    encoder.writeFrame(indexed, canvas.width, canvas.height, {
      palette,
      delay: FRAME_DELAY,
      repeat: frameCount === 0 ? 0 : undefined,
    });
    frameCount += 1;
  } finally {
    captureBusy = false;
  }
}

async function stopCapture(): Promise<
  | { ok: true; dataUrl: string; width: number; height: number; frames: number }
  | { ok: false; error: string }
> {
  if (!encoder || !canvas)
    return { ok: false, error: "No recording is active" };
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (captureBusy)
    await new Promise((resolve) => window.setTimeout(resolve, FRAME_DELAY));
  if (frameCount === 0) captureFrame();

  encoder.finish();
  const bytes = encoder.bytes();
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  const blob = new Blob([output.buffer], { type: "image/gif" });
  const dataUrl = await blobToDataUrl(blob);
  const result = {
    ok: true as const,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    frames: frameCount,
  };
  await reset();
  return result;
}

async function reset(): Promise<void> {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((track) => track.stop());
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  stream = null;
  video = null;
  canvas = null;
  encoder = null;
  frameCount = 0;
  captureBusy = false;
  sourceRect = null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read GIF"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
