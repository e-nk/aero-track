import { NA, amount, clock, duration, nearestAirport } from "@aerotrack/detectors";
import { AIRPORTS, DISPLAY_TIME_ZONE, THRESHOLDS, type BehaviourEvent, type DataMode } from "@aerotrack/shared";

// Flight alerts (docs/superpowers/specs/2026-10-18-flight-alerts-design.md). Pure: no DOM, no store.
// Wording never states a cause (rule 8); missing values read "Not available" (rule 2).

export type AlertKind = "takeoff" | "landing" | "circling" | "signal_lost" | "signal_back" | "emergency" | "rapid_descent";

export interface Alert {
  id: string;
  eventId: string;
  hex: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: number; // epoch seconds
  mode: DataMode;
}

export interface AlertInput {
  opened: readonly BehaviourEvent[];
  closed: readonly BehaviourEvent[];
  watched: ReadonlySet<string>;
  /** Events that opened before this time (epoch seconds) don't alert. */
  since: (hex: string) => number;
  identity: (hex: string) => { callsign: string | null; registration: string | null } | undefined;
  position: (hex: string) => { lat: number; lon: number } | undefined;
  mode: DataMode;
  timeZone?: string;
}

const MAX_ALERTS = 50;
const NEAR_KM = 3;
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lon - from.lon) * rad) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lon - from.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** "about 25 km south of {airport} " near a known airport, otherwise "" (never guessed). */
export function placePhrase(pos: { lat: number; lon: number } | undefined): string {
  if (!pos) return "";
  const near = nearestAirport(pos.lat, pos.lon, THRESHOLDS.alerts.placeWithinKm, AIRPORTS);
  if (!near) return "";
  const { airport, km } = near;
  if (km < NEAR_KM) return `near ${airport.name} `;
  const dir = COMPASS[Math.round(bearingDeg(airport, pos) / 45) % 8];
  return `about ${Math.max(5, Math.round(km / 5) * 5)} km ${dir} of ${airport.name} `;
}

/** "near {airport} at 12:35 pm" or "at 12:35 pm, away from the airports we know about" (same as the explanations). */
function where(e: BehaviourEvent["evidence"], timeZone: string): string {
  const time = clock(e.at, timeZone);
  return typeof e.airportName === "string" ? `near ${e.airportName} at ${time}` : `at ${time}, away from the airports we know about`;
}

const CHECK_AIRLINE = "The data doesn't show why. Check with the airline for official information.";

function wordingForOpen(e: BehaviourEvent, name: string, input: AlertInput, timeZone: string): { kind: AlertKind; title: string; body: string } | null {
  const ev = e.evidence;
  switch (e.type) {
    case "takeoff":
      return { kind: "takeoff", title: `${name} took off`, body: `${name} took off ${where(ev, timeZone)}.` };
    case "landing":
      return { kind: "landing", title: `${name} landed`, body: `${name} landed ${where(ev, timeZone)}.` };
    case "circling":
      return {
        kind: "circling",
        title: `${name} is circling`,
        body: `${name} has been circling ${placePhrase(input.position(e.hex))}for about ${duration(ev.spanSec)}. Aircraft commonly do this while waiting to land. The data doesn't show why.`,
      };
    case "signal_lost":
      return {
        kind: "signal_lost",
        title: `No new position for ${name}`,
        body: `We haven't had a position for ${name} for ${duration(ev.secondsSinceLastPosition)}. This is common over the ocean, where there are few receivers.`,
      };
    case "emergency":
      return {
        kind: "emergency",
        title: `${name} is transmitting an emergency code`,
        body: `Crews use these codes to get priority help, and many such flights land normally. ${CHECK_AIRLINE}`,
      };
    case "rapid_descent": {
      const rate = amount(ev.peakRateFpm, 100);
      return { kind: "rapid_descent", title: `${name} is descending faster than usual`, body: `About ${rate || NA} ft per minute. ${CHECK_AIRLINE}` };
    }
    default:
      return null; // climbs, descents, turns, gaps and glitches don't alert
  }
}

export function alertsForChanges(input: AlertInput): Alert[] {
  const timeZone = input.timeZone ?? DISPLAY_TIME_ZONE;
  const nameOf = (hex: string) => {
    const id = input.identity(hex);
    return id?.callsign ?? id?.registration ?? hex;
  };
  const relevant = (e: BehaviourEvent) => input.watched.has(e.hex) && e.openedAt >= input.since(e.hex);
  const out: Alert[] = [];

  for (const e of input.opened) {
    if (!relevant(e)) continue;
    const w = wordingForOpen(e, nameOf(e.hex), input, timeZone);
    // Take-off and landing are confirmed a few reports later: date them by the moment itself,
    // so the list's time matches the time in the sentence.
    const moment = (e.type === "takeoff" || e.type === "landing") && typeof e.evidence.at === "number" ? e.evidence.at : e.openedAt;
    if (w) out.push({ id: `${e.id}:open`, eventId: e.id, hex: e.hex, ...w, at: moment, mode: input.mode });
  }
  for (const e of input.closed) {
    if (e.type !== "signal_lost" || !relevant(e)) continue;
    const name = nameOf(e.hex);
    out.push({
      id: `${e.id}:close`,
      eventId: e.id,
      hex: e.hex,
      kind: "signal_back",
      title: `Tracking ${name} again`,
      body: `New positions for ${name} are arriving again.`,
      at: e.closedAt ?? e.updatedAt,
      mode: input.mode,
    });
  }
  return out;
}

/** Merge fresh alerts into the list: no duplicates (by id), newest first, at most 50. */
export function appendAlerts(existing: readonly Alert[], fresh: readonly Alert[]): { alerts: Alert[]; added: number } {
  const seen = new Set(existing.map((a) => a.id));
  const novel: Alert[] = [];
  for (const a of fresh) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    novel.push(a);
  }
  if (!novel.length) return { alerts: existing as Alert[], added: 0 };
  const alerts = [...novel, ...existing].sort((a, b) => b.at - a.at).slice(0, MAX_ALERTS);
  return { alerts, added: novel.length };
}

/** Toast and notify? Live: always. Recorded: only alerts from near the replay clock, so seeking doesn't fire a burst. */
export function shouldAnnounce(alert: Alert, replayClock: number | null): boolean {
  if (alert.mode === "live") return true;
  return replayClock !== null && Math.abs(replayClock - alert.at) <= THRESHOLDS.alerts.backfillSec;
}
