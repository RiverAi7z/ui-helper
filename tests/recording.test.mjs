import { test } from "node:test";
import assert from "node:assert/strict";
import { captureGeometry } from "../apps/extension/lib/capture-geometry.ts";
import {
  parseRecordingLimit,
  normalizeRecordingLimit,
} from "../apps/extension/lib/recording-limit.ts";

test("window capture preserves max edge and even rounding without upscaling", () => {
  assert.deepEqual(captureGeometry(1920, 1080), {
    sourceRect: { x: 0, y: 0, width: 1920, height: 1080 },
    width: 960,
    height: 540,
  });
  assert.deepEqual(captureGeometry(301, 201), {
    sourceRect: { x: 0, y: 0, width: 301, height: 201 },
    width: 302,
    height: 202,
  });
});

test("area capture preserves letterboxing, viewport scaling, and edge clipping", () => {
  assert.deepEqual(
    captureGeometry(1920, 1080, {
      viewportWidth: 800,
      viewportHeight: 600,
      x: 100,
      y: 50,
      width: 300,
      height: 200,
    }),
    {
      sourceRect: { x: 420, y: 90, width: 540, height: 360 },
      width: 540,
      height: 360,
    },
  );
  assert.deepEqual(
    captureGeometry(800, 600, {
      viewportWidth: 800,
      viewportHeight: 600,
      x: 799,
      y: 599,
      width: 20,
      height: 20,
    }),
    {
      sourceRect: { x: 799, y: 599, width: 1, height: 1 },
      width: 2,
      height: 2,
    },
  );
  assert.deepEqual(
    captureGeometry(800, 600, {
      viewportWidth: 0,
      viewportHeight: 0,
      x: -10,
      y: -10,
      width: 0,
      height: 0,
    }),
    {
      sourceRect: { x: 0, y: 0, width: 2, height: 2 },
      width: 2,
      height: 2,
    },
  );
});

test("duration text parsing remains distinct from numeric command rounding", () => {
  for (const [value, expected] of [
    ["", 20],
    ["0", 20],
    ["abc", 20],
    ["-2", 1],
    ["61", 60],
    ["1.6", 1],
    ["12x", 12],
  ])
    assert.equal(parseRecordingLimit(value), expected);
  for (const [value, expected] of [
    [0, 20],
    [NaN, 20],
    [-2, 1],
    [61, 60],
    [1.6, 2],
    [0.4, 20],
    [Infinity, 60],
  ])
    assert.equal(normalizeRecordingLimit(value), expected);
});
