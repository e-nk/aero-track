import { airlineForCallsign, type OverviewAircraft } from "@aerotrack/shared";
import { iconClass, type IconClass } from "./iconClass";
import type { LiveAircraft } from "./liveState";

// Map filters (SPEC 12.6). Not persisted.

export interface Filters {
  airline: string | null; // ICAO airline code from the callsign prefix
  typeClass: IconClass | null;
}

export const NO_FILTERS: Filters = { airline: null, typeClass: null };
const CLASS_ORDER: IconClass[] = ["narrowbody", "widebody", "turboprop", "light", "helicopter", "unknown"];

const airlineOf = (callsign: string | null) => airlineForCallsign(callsign)?.icao ?? null;

export function filterAircraft(list: LiveAircraft[], f: Filters): LiveAircraft[] {
  return list.filter((a) => (!f.airline || airlineOf(a.callsign) === f.airline) && (!f.typeClass || iconClass(a) === f.typeClass));
}

/** Overview aircraft have no type, so a type filter keeps them only for "unknown". */
export function filterOverview(list: OverviewAircraft[], f: Filters): OverviewAircraft[] {
  return list.filter((a) => (!f.airline || airlineOf(a.callsign) === f.airline) && (!f.typeClass || f.typeClass === "unknown"));
}

/** Airlines on the map now, most common first. */
export function airlineOptions(callsigns: (string | null)[], overview: OverviewAircraft[] = []) {
  const counts = new Map<string, { icao: string; name: string; count: number }>();
  for (const cs of [...callsigns, ...overview.map((a) => a.callsign)]) {
    const airline = airlineForCallsign(cs);
    if (!airline) continue;
    const entry = counts.get(airline.icao) ?? { ...airline, count: 0 };
    entry.count++;
    counts.set(airline.icao, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Aircraft classes on the map now, in a fixed order. */
export function typeClassOptions(list: LiveAircraft[]): IconClass[] {
  const present = new Set(list.map((a) => iconClass(a)));
  return CLASS_ORDER.filter((c) => present.has(c));
}

export const CLASS_LABEL: Record<IconClass, string> = {
  narrowbody: "Single-aisle jets",
  widebody: "Wide-body jets",
  turboprop: "Turboprops",
  light: "Light aircraft",
  helicopter: "Helicopters",
  unknown: "Unknown type",
};

/** "live" → "Live now", "last_seen_12m" → "Last seen 12 min ago", "not_seen" → "Not seen recently". */
export function freshnessText(freshness: string): string {
  if (freshness === "live") return "Live now";
  const m = /^last_seen_(\d+)m$/.exec(freshness);
  if (!m) return "Not seen recently";
  const min = Number(m[1]);
  if (min < 60) return `Last seen ${min} min ago`;
  const hours = Math.round(min / 60);
  return `Last seen ${hours} hour${hours === 1 ? "" : "s"} ago`;
}
