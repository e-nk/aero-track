export type AltitudeBand = "ground" | "low" | "mid" | "high" | "unknown";

export function altitudeBand(
  altFt: number | null,
  onGround: boolean,
  [lowBelow, highFrom]: readonly [number, number],
): AltitudeBand {
  if (onGround) return "ground";
  if (altFt === null) return "unknown";
  if (altFt < lowBelow) return "low";
  return altFt < highFrom ? "mid" : "high";
}

export interface Fix {
  lat: number;
  lon: number;
  gsKt: number | null;
  trackDeg: number | null;
  onGround: boolean;
}

/**
 * Estimated position elapsedSec after the fix, moving along the track at
 * ground speed. Capped at maxSec. No movement without speed and track, or on
 * the ground.
 */
export function deadReckon(fix: Fix, elapsedSec: number, maxSec: number): { lat: number; lon: number } {
  const sec = Math.min(Math.max(elapsedSec, 0), maxSec);
  if (sec === 0 || fix.onGround || fix.gsKt === null || fix.trackDeg === null) return { lat: fix.lat, lon: fix.lon };
  const nm = (fix.gsKt * sec) / 3600;
  const rad = (fix.trackDeg * Math.PI) / 180;
  const lat = fix.lat + (nm * Math.cos(rad)) / 60;
  const lon = fix.lon + (nm * Math.sin(rad)) / (60 * Math.cos((fix.lat * Math.PI) / 180));
  return { lat, lon };
}
