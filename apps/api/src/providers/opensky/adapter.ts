import type { OverviewAircraft } from "@aerotrack/shared";
import type { ParsedStates } from "./schema";

const FT_PER_M = 3.28084;
const KT_PER_MS = 1.943844;
const FPM_PER_MS = 196.8504;
// OpenSky categories 16-20: surface vehicles and obstacles, not aircraft.
const NOT_AIRCRAFT = new Set([16, 17, 18, 19, 20]);

export interface AdaptedStates {
  aircraft: OverviewAircraft[];
  skipped: { notAircraft: number; noPosition: number; rejectedBySchema: number };
}

const m = (v: number | null, factor: number) => (v === null ? null : Math.round(v * factor));

/** Converts OpenSky states (metric) into our overview aircraft. Nothing raw leaves this file. */
export function adaptStates(parsed: ParsedStates): AdaptedStates {
  const aircraft: OverviewAircraft[] = [];
  const skipped = { notAircraft: 0, noPosition: 0, rejectedBySchema: parsed.rejected };

  for (const row of parsed.rows) {
    const [hex, callsign, , timePosition, , lon, lat, baroM, onGround, velocity, track, vrate, , geoM] = row;
    const category = row[17];
    if (typeof category === "number" && NOT_AIRCRAFT.has(category)) {
      skipped.notAircraft++;
      continue;
    }
    if (lat === null || lon === null || timePosition === null) {
      skipped.noPosition++;
      continue;
    }
    aircraft.push({
      hex,
      callsign: callsign?.trim() || null,
      lat,
      lon,
      altFt: m(baroM, FT_PER_M),
      altGeomFt: m(geoM, FT_PER_M),
      gsKt: velocity === null ? null : Math.round(velocity * KT_PER_MS * 10) / 10,
      trackDeg: track,
      baroRateFpm: m(vrate, FPM_PER_MS),
      onGround,
      lastPosTs: timePosition,
    });
  }
  return { aircraft, skipped };
}
