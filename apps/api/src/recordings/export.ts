import { DISPLAY_TIME_ZONE, type AircraftState, type RecordingAircraft, type RecordingFile, type RecordingPoint } from "@aerotrack/shared";
import type { StoredPosition } from "../repo";

// Builds a recording (SPEC 8) from stored live positions. Pure: the caller loads the rows.

type Identity = Pick<AircraftState, "hex" | "callsign" | "registration" | "typeCode" | "category">;

export interface BuildRecordingInput {
  title: string;
  from: number; // epoch seconds, inclusive
  to: number; // epoch seconds, inclusive
  rows: StoredPosition[];
  identities: Identity[];
  hexes?: string[];
  source?: string;
  attribution?: string;
}

const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-10-17-evening-arrivals-sydney": Sydney date of the start, plus a slug of the title. */
export function recordingId(title: string, from: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${isoDate.format(new Date(from * 1000))}-${slug}`;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function buildRecording(input: BuildRecordingInput): RecordingFile {
  const only = input.hexes ? new Set(input.hexes) : null;
  const byHex = new Map<string, RecordingPoint[]>();
  for (const r of input.rows) {
    const o = r.obs;
    if (o.t < input.from || o.t > input.to || (only && !only.has(r.hex))) continue;
    const points = byHex.get(r.hex) ?? [];
    points.push([o.t, o.lat, o.lon, o.altFt, o.gsKt, o.trackDeg, o.baroRateFpm, o.onGround, r.squawk]);
    byHex.set(r.hex, points);
  }
  if (!byHex.size) throw new Error("No positions in that window");

  const ids = new Map(input.identities.map((i) => [i.hex, i]));
  const aircraft: RecordingAircraft[] = [...byHex]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hex, points]) => {
      const id = ids.get(hex);
      return {
        hex,
        callsign: id?.callsign ?? null,
        registration: id?.registration ?? null,
        typeCode: id?.typeCode ?? null,
        category: id?.category ?? null,
        points: points.sort((p, q) => p[0] - q[0]),
      };
    });

  // A loop rather than Math.min(...): long recordings can exceed the argument limit.
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  let [firstT, lastT] = [Infinity, -Infinity];
  for (const a of aircraft) {
    for (const [t, lat, lon] of a.points) {
      firstT = Math.min(firstT, t);
      lastT = Math.max(lastT, t);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return {
    id: recordingId(input.title, input.from),
    title: input.title,
    mode: "recorded",
    source: input.source ?? "ADSB.lol live capture",
    attribution: input.attribution ?? "Data: ADSB.lol (ODbL)",
    // The span the data actually covers (gaps at either end are trimmed), so a replay never opens on an empty map.
    capturedFrom: Math.max(input.from, Math.floor(firstT)),
    capturedTo: Math.min(input.to, Math.ceil(lastT)),
    bbox: [round6(minLon), round6(minLat), round6(maxLon), round6(maxLat)],
    reportedCause: null,
    aircraft,
  };
}
