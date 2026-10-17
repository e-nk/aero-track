import type { Thresholds } from "@aerotrack/shared";
import { altitudeBand, deadReckon } from "./geo";
import type { LiveState } from "./liveState";
import type { AircraftFeatureCollection } from "./aircraftFeatures";

/**
 * GeoJSON for the Australia-wide overview layer (SPEC 11.10). Aircraft already
 * drawn by the detailed layer are skipped. Overview data has no aircraft type,
 * so it uses the generic icon (or a dot when the direction is unknown).
 */
export function buildOverviewFeatures(
  overview: NonNullable<LiveState["overview"]>,
  skipHexes: ReadonlySet<string>,
  nowMs: number,
  display: Thresholds["display"],
): AircraftFeatureCollection {
  const fetchedAt = overview.fetchedAt ?? 0;
  return {
    type: "FeatureCollection",
    features: Object.values(overview.aircraft)
      .filter((a) => !skipHexes.has(a.hex))
      .map((a) => {
        const ageSec = fetchedAt - a.lastPosTs + (nowMs - overview.receivedAtMs) / 1000;
        const { lat, lon } = deadReckon(a, ageSec, display.interpolateMaxSec);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [lon, lat] as [number, number] },
          properties: {
            hex: a.hex,
            callsign: a.callsign,
            icon: a.trackDeg === null ? ("dot" as const) : ("unknown" as const),
            band: altitudeBand(a.altGeomFt ?? a.altFt, a.onGround, display.altitudeBandsFt),
            rotation: a.trackDeg ?? 0,
            stale: overview.feedStatus === "down",
            hasEvent: false,
            source: "overview" as const,
          },
        };
      }),
  };
}
