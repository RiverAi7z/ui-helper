// Keep the UI parser and numeric command rounding distinct for compatibility.
export function parseRecordingLimit(input: string): number {
  return Math.min(60, Math.max(1, Number.parseInt(input, 10) || 20));
}

export function normalizeRecordingLimit(value: number): number {
  return Math.min(60, Math.max(1, Math.round(value) || 20));
}
