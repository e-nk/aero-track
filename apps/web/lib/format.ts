// Details panel formatting (SPEC 12.4). Plain English; missing values say so.
export const NOT_AVAILABLE = "Not available from this source";

const n = new Intl.NumberFormat("en-US");
const KMH_PER_KNOT = 1.852;
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

const PRESSURE_NOTE =
  "Measured against standard air pressure, so it can differ from the real height by a few hundred feet.";

export interface DisplayAltitude {
  text: string;
  ft: number | null; // the value shown, for colour bands
  note: string | null;
}

/** GPS altitude when we have it, otherwise labelled pressure altitude (SPEC 12.4). */
export function displayAltitude(a: { altFt: number | null; altGeomFt: number | null; onGround: boolean }): DisplayAltitude {
  if (a.onGround) return { text: "On the ground", ft: 0, note: null };
  if (a.altGeomFt !== null) return { text: `${n.format(Math.round(a.altGeomFt))} ft (GPS)`, ft: a.altGeomFt, note: null };
  if (a.altFt !== null) {
    return { text: `${n.format(Math.round(a.altFt))} ft (pressure altitude)`, ft: a.altFt, note: PRESSURE_NOTE };
  }
  return { text: NOT_AVAILABLE, ft: null, note: null };
}

export function formatSpeed(gsKt: number | null): string {
  if (gsKt === null) return NOT_AVAILABLE;
  return `${n.format(Math.round(gsKt))} knots (about ${n.format(Math.round(gsKt * KMH_PER_KNOT))} km/h)`;
}

export function formatHeading(trackDeg: number | null): string {
  if (trackDeg === null) return NOT_AVAILABLE;
  const word = COMPASS[Math.round(trackDeg / 45) % 8];
  return `${Math.round(trackDeg) % 360}° (${word})`;
}

export function formatVerticalRate(fpm: number | null, levelRateFpm: number): string {
  if (fpm === null) return NOT_AVAILABLE;
  if (Math.abs(fpm) < levelRateFpm) return "Level";
  const rate = n.format(Math.round(Math.abs(fpm) / 100) * 100);
  return `${fpm > 0 ? "Climbing" : "Descending"} about ${rate} ft per minute`;
}

export function formatAge(sec: number): string {
  if (sec < 1) return "just now";
  if (sec < 60) return `${Math.round(sec)} s ago`;
  return `${Math.round(sec / 60)} min ago`;
}

export function formatType(typeCode: string | null, typeDesc: string | null): string {
  if (!typeCode) return NOT_AVAILABLE;
  return typeDesc ? `${typeCode} · ${typeDesc}` : typeCode;
}
