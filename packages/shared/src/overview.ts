// Australia-wide overview aircraft (SPEC 5.8, 11.10). Display only: no detectors.

export interface OverviewAircraft {
  hex: string;
  callsign: string | null;
  lat: number;
  lon: number;
  altFt: number | null; // barometric
  altGeomFt: number | null; // GPS, display only
  gsKt: number | null;
  trackDeg: number | null;
  baroRateFpm: number | null;
  onGround: boolean;
  lastPosTs: number; // epoch seconds, position time
}

/** [hex, callsign, lat, lon, altFt, altGeomFt, gsKt, trackDeg, baroRateFpm, onGround, lastPosTs] */
export type OverviewCompact = [
  hex: string,
  callsign: string | null,
  lat: number,
  lon: number,
  altFt: number | null,
  altGeomFt: number | null,
  gsKt: number | null,
  trackDeg: number | null,
  baroRateFpm: number | null,
  onGround: boolean,
  lastPosTs: number,
];

export function toOverviewCompact(a: OverviewAircraft): OverviewCompact {
  return [a.hex, a.callsign, a.lat, a.lon, a.altFt, a.altGeomFt, a.gsKt, a.trackDeg, a.baroRateFpm, a.onGround, a.lastPosTs];
}

export function fromOverviewCompact(c: OverviewCompact): OverviewAircraft {
  const [hex, callsign, lat, lon, altFt, altGeomFt, gsKt, trackDeg, baroRateFpm, onGround, lastPosTs] = c;
  return { hex, callsign, lat, lon, altFt, altGeomFt, gsKt, trackDeg, baroRateFpm, onGround, lastPosTs };
}
