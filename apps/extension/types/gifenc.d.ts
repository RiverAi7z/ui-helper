declare module "gifenc" {
  export interface GifEncoder {
    writeFrame(
      pixels: Uint8Array,
      width: number,
      height: number,
      options: {
        palette: number[][];
        delay?: number;
        repeat?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(): GifEncoder;
  export function quantize(
    rgba: Uint8Array,
    maxColors: number,
    options?: { format?: "rgb444" | "rgb565" | "rgba4444" },
  ): number[][];
  export function applyPalette(
    rgba: Uint8Array,
    palette: number[][],
    format?: "rgb444" | "rgb565" | "rgba4444",
  ): Uint8Array;
}
