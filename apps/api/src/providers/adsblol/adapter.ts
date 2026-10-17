import type { AircraftState, Observation } from "@aerotrack/shared";
import type { AdsbLolAircraft, ParsedResponse } from "./schema";

// Type designators used for things that are not aircraft (seen live: towers).
const NON_AIRCRAFT_TYPES = new Set(["TWR"]);

export interface AdaptedResponse {
  states: AircraftState[];
  skipped: { notAircraft: number; noPosition: number };
}

/** Converts a parsed adsb.lol response into our own types. Nothing raw leaves this file. */
export function adaptResponse(res: ParsedResponse): AdaptedResponse {
  const states: AircraftState[] = [];
  const skipped = { notAircraft: 0, noPosition: 0 };

  for (const ac of res.aircraft) {
    if (!isAircraft(ac)) {
      skipped.notAircraft++;
      continue;
    }
    const last = observation(ac, res.now);
    if (!last) {
      skipped.noPosition++;
      continue;
    }
    states.push({
      hex: ac.hex,
      callsign: text(ac.flight),
      registration: text(ac.r),
      typeCode: text(ac.t),
      typeDesc: text(ac.desc),
      category: text(ac.category),
      squawk: text(ac.squawk),
      emergency: text(ac.emergency), // absent means unknown, not "none"
      last,
      lastPosTs: last.t,
      mode: "live",
    });
  }
  return { states, skipped };
}

function isAircraft(ac: AdsbLolAircraft): boolean {
  if (ac.category?.startsWith("C")) return false; // ground vehicles and obstacles
  if (ac.t && NON_AIRCRAFT_TYPES.has(ac.t)) return false;
  return true;
}

function observation(ac: AdsbLolAircraft, nowMs: number): Observation | null {
  if (ac.lat === undefined || ac.lon === undefined || ac.seen_pos === undefined) return null;
  const onGround = ac.alt_baro === "ground";
  return {
    // Position time, not receipt time. Rounded to the millisecond.
    t: Math.round(nowMs - ac.seen_pos * 1000) / 1000,
    lat: ac.lat,
    lon: ac.lon,
    altFt: typeof ac.alt_baro === "number" ? ac.alt_baro : onGround ? 0 : null,
    onGround,
    gsKt: ac.gs ?? null,
    trackDeg: ac.track ?? null,
    baroRateFpm: ac.baro_rate ?? ac.geom_rate ?? null,
  };
}

function text(v: string | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}
