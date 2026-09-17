import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

function setup(existing = false) {
  const calls = [];
  const chrome = {
    offscreen: {
      Reason: { USER_MEDIA: "USER_MEDIA" },
      hasDocument: async () => {
        calls.push(["hasDocument"]);
        return existing;
      },
      createDocument: async (options) => {
        calls.push(["createDocument", options]);
      },
    },
    runtime: {
      sendMessage: async (message) => {
        calls.push(["send", message]);
        return { ok: true };
      },
    },
    tabCapture: {
      getMediaStreamId: (options, callback) => {
        calls.push(["stream", options]);
        callback("stream-id");
      },
    },
  };
  const api = loadTypeScript(
    new URL("../apps/extension/lib/background-recording.ts", import.meta.url),
    { chrome },
  );
  return { ...api, chrome, calls };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("capture startup preserves offscreen creation order, target tab and crop payload", async () => {
  const env = setup();
  const crop = {
    x: 1,
    y: 2,
    width: 30,
    height: 40,
    viewportWidth: 800,
    viewportHeight: 600,
  };
  assert.equal(
    (await env.handleRecordingRequest({ type: "START_RECORDING", crop }, 11))
      .ok,
    true,
  );
  assert.deepEqual(plain(env.calls), [
    ["hasDocument"],
    [
      "createDocument",
      {
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification:
          "Encode the user-requested current-tab recording as a GIF.",
      },
    ],
    ["stream", { targetTabId: 11 }],
    [
      "send",
      {
        target: "offscreen",
        type: "START_CAPTURE",
        streamId: "stream-id",
        crop,
      },
    ],
  ]);
});

test("existing offscreen document is reused; stop forwards unchanged result without creating one", async () => {
  const env = setup(true);
  await env.handleRecordingRequest({ type: "START_RECORDING" }, 11);
  assert.equal(
    env.calls.some(([name]) => name === "createDocument"),
    false,
  );
  env.calls.length = 0;
  const result = {
    ok: true,
    dataUrl: "data:image/gif;base64,",
    width: 100,
    height: 80,
    frames: 3,
  };
  env.chrome.runtime.sendMessage = async (message) => {
    env.calls.push(["send", message]);
    return result;
  };
  assert.equal(
    await env.handleRecordingRequest({ type: "STOP_RECORDING" }),
    result,
  );
  assert.deepEqual(plain(env.calls), [
    ["send", { target: "offscreen", type: "STOP_CAPTURE" }],
  ]);
});

test("missing tab, capture lastError and rejected transport retain errors", async () => {
  const env = setup(true);
  assert.equal(
    (await env.handleRecordingRequest({ type: "START_RECORDING" })).error,
    "No active tab is available for recording",
  );
  assert.equal(env.calls.length, 0);
  env.chrome.runtime.lastError = { message: "Permission denied" };
  assert.equal(
    (await env.handleRecordingRequest({ type: "START_RECORDING" }, 11)).error,
    "Permission denied",
  );
  env.chrome.runtime.sendMessage = async () => {
    throw "Transport unavailable";
  };
  assert.equal(
    (await env.handleRecordingRequest({ type: "STOP_RECORDING" })).error,
    "Transport unavailable",
  );
});
