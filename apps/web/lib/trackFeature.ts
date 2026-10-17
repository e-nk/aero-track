import type { Observation } from "@aerotrack/shared";

export interface TrackFeature {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "MultiLineString"; coordinates: [number, number][][] };
}

/**
 * One line per segment, so the map never draws across a gap (SPEC 9.8).
 * Single-point segments are skipped. Null when there is nothing to draw.
 */
export function trackFeature(segments: Observation[][]): TrackFeature | null {
  const lines = segments.filter((s) => s.length >= 2).map((s) => s.map((o): [number, number] => [o.lon, o.lat]));
  if (!lines.length) return null;
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } };
}
