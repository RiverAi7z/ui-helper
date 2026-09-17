import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

function setup(responses) {
  const messages = [];
  let id = 0;
  const api = loadTypeScript(
    new URL("../apps/extension/lib/recording-client.ts", import.meta.url),
    {
      chrome: {
        runtime: {
          sendMessage: async (message) => {
            messages.push(message);
            const result = responses.shift();
            if (result instanceof Error) throw result;
            return result;
          },
        },
      },
      Date: class extends Date {
        constructor() {
          super("2026-09-17T12:34:56.789Z");
        }
      },
      crypto: {
        randomUUID: () => (++id === 1 ? "abcdef-file-id" : "asset-id"),
      },
    },
  );
  return { ...api, messages };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("encode/save preserves message order, filename format and portable recording asset", async () => {
  const env = setup([
    { ok: true, dataUrl: "data:gif", width: 100, height: 80, frames: 3 },
    { ok: true, relativePath: ".ui-helper/recordings/saved.gif" },
  ]);
  const region = { x: 1, y: 2, pageX: 11, pageY: 12, width: 30, height: 40 };
  assert.deepEqual(plain(await env.encodeAndSaveRecording("area", region)), {
    ok: true,
    asset: {
      id: "asset-id",
      relativePath: ".ui-helper/recordings/saved.gif",
      width: 100,
      height: 80,
      frames: 3,
      comment: "",
      scope: "area",
      region,
    },
  });
  assert.deepEqual(plain(env.messages), [
    { type: "STOP_RECORDING" },
    {
      type: "PANEL_SAVE_GIF",
      dataUrl: "data:gif",
      filename: "recording-20260917123456-abcdef.gif",
    },
  ]);
});

test("encode/save failures preserve notices and never fabricate a saved asset", async () => {
  for (const [responses, error, count] of [
    [[undefined], "Unable to encode GIF", 1],
    [[{ ok: false, error: "Encode failed" }], "Encode failed", 1],
    [
      [{ ok: true }, undefined],
      "Unable to save GIF. Keep the sidebar open while recording.",
      2,
    ],
    [[{ ok: true }, { ok: false, error: "Disk full" }], "Disk full", 2],
  ]) {
    const env = setup(responses);
    assert.deepEqual(plain(await env.encodeAndSaveRecording("window")), {
      ok: false,
      error,
    });
    assert.equal(env.messages.length, count);
  }
  const env = setup([new Error("Disconnected")]);
  await assert.rejects(env.encodeAndSaveRecording("window"), /Disconnected/);
});
