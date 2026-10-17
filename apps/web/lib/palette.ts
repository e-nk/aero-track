import type { AltitudeBand } from "./geo";

// SPEC 12.7. Amber is reserved for "possible" events, stale data and warnings.
export const PALETTE = {
  navy: "#101B2E",
  sky: "#51B9FF",
  teal: "#23C9A9",
  amber: "#F5B85B",
  text: "#E9F1F9",
  muted: "#8A9BB4",
} as const;

export const BAND_COLOUR: Record<AltitudeBand, string> = {
  ground: PALETTE.muted,
  unknown: PALETTE.muted,
  low: PALETTE.teal,
  mid: PALETTE.sky,
  high: PALETTE.text,
};
