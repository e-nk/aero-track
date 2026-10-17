import type { AircraftState } from "./types";

/**
 * Small per-aircraft tuple for SSE snapshots (SPEC 11.8):
 * [hex, callsign, lat, lon, altFt, gsKt, trackDeg, baroRateFpm, typeCode,
 *  category, lastPosTs, hasOpenEvent, onGround]
 */
export type CompactAircraft = [
  hex: string,
  callsign: string | null,
  lat: number,
  lon: number,
  altFt: number | null,
  gsKt: number | null,
  trackDeg: number | null,
  baroRateFpm: number | null,
  typeCode: string | null,
  category: string | null,
  lastPosTs: number,
  hasOpenEvent: boolean,
  onGround: boolean,
];

export interface DecodedAircraft {
  hex: string;
  callsign: string | null;
  lat: number;
  lon: number;
  altFt: number | null;
  gsKt: number | null;
  trackDeg: number | null;
  baroRateFpm: number | null;
  typeCode: string | null;
  category: string | null;
  lastPosTs: number;
  hasOpenEvent: boolean;
  onGround: boolean;
}

export function toCompact(s: AircraftState, hasOpenEvent: boolean): CompactAircraft {
  const o = s.last;
  return [
    s.hex,
    s.callsign,
    o.lat,
    o.lon,
    o.altFt,
    o.gsKt,
    o.trackDeg,
    o.baroRateFpm,
    s.typeCode,
    s.category,
    s.lastPosTs,
    hasOpenEvent,
    o.onGround,
  ];
}

export function fromCompact(c: CompactAircraft): DecodedAircraft {
  const [hex, callsign, lat, lon, altFt, gsKt, trackDeg, baroRateFpm, typeCode, category, lastPosTs, hasOpenEvent, onGround] = c;
  return { hex, callsign, lat, lon, altFt, gsKt, trackDeg, baroRateFpm, typeCode, category, lastPosTs, hasOpenEvent, onGround };
}
