import type { Thresholds } from "@aerotrack/shared";
import { altitudeBand, deadReckon, type AltitudeBand } from "./geo";
import { iconClass, type IconClass } from "./iconClass";
import type { LiveAircraft } from "./liveState";

export interface AircraftFeatureProps {
  hex: string;
  callsign: string | null;
  icon: IconClass | "dot"; // "dot" when the direction of travel is unknown
  band: AltitudeBand;
  rotation: number;
  stale: boolean;
  hasEvent: boolean;
  source?: "live" | "overview";
  followed?: boolean;
}

export interface AircraftFeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    id?: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: AircraftFeatureProps;
  }[];
}

/** GeoJSON for the aircraft layer at browser time nowMs, with dead reckoning between updates. */
export function buildAircraftFeatures(
  aircraft: LiveAircraft[],
  nowMs: number,
  display: Thresholds["display"],
  followed: ReadonlySet<string> = new Set(),
): AircraftFeatureCollection {
  return {
    type: "FeatureCollection",
    features: aircraft.map((a) => {
      // Position age = age at the server when sent + local time since it arrived.
      const ageSec = a.serverNow - a.lastPosTs + (nowMs - a.receivedAtMs) / 1000;
      const { lat, lon } = deadReckon(a, ageSec, display.interpolateMaxSec);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          hex: a.hex,
          callsign: a.callsign,
          icon: a.trackDeg === null ? "dot" : iconClass(a),
          // Same altitude the panel shows: GPS when present, else barometric.
          band: altitudeBand(a.altGeomFt ?? a.altFt, a.onGround, display.altitudeBandsFt),
          rotation: a.trackDeg ?? 0,
          stale: ageSec > display.staleAfterSec,
          hasEvent: a.hasOpenEvent,
          followed: followed.has(a.hex),
        },
      };
    }),
  };
}
