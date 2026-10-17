import { DISPLAY_TIME_ZONE, type Detection, type Explanation } from "@aerotrack/shared";
import { NA, amount, clock, duration } from "./format";

export { formatDuration } from "./format";

// SPEC section 10. Fill only from evidence; anything missing reads "Not available".
/** "near {airport} at 12:20 pm" or "at 12:20 pm, away from the airports we know about". */
function where(e: Detection["evidence"], timeZone: string): string {
  const time = clock(e.at, timeZone);
  return typeof e.airportName === "string"
    ? `near ${e.airportName} at ${time}`
    : `at ${time}, away from the airports we know about`;
}

export interface ExplainOptions {
  timeZone?: string;
}

export function explain(d: Detection, opts: ExplainOptions = {}): Explanation {
  const e = d.evidence;
  const timeZone = opts.timeZone ?? DISPLAY_TIME_ZONE;

  switch (d.type) {
    case "climb":
      return {
        seen: `This aircraft has climbed ${amount(e.netFt, 100)} ft in the last ${duration(e.spanSec)}.`,
        commonly: "Aircraft climb after take-off and when moving to a new cruising level.",
        cannotTell: "The data doesn't show why it is climbing.",
      };
    case "descent":
      return {
        seen: `This aircraft has descended ${amount(e.netFt, 100)} ft in the last ${duration(e.spanSec)}.`,
        commonly: "This often happens on approach to land.",
        cannotTell: "The data doesn't confirm why or where it will land.",
      };
    case "turn":
      return {
        seen: `This aircraft has turned ${amount(e.totalDeg, 1)}° to the ${e.direction ?? NA} in the last ${duration(e.spanSec)}.`,
        commonly: "Turns are often part of a planned route or an adjustment in flight.",
        cannotTell: "The data doesn't show the reason for the turn.",
      };
    case "circling":
      return {
        // "within" is an upper bound, so the spread rounds up.
        seen: `This aircraft has turned through ${amount(e.totalDeg, 1)}° in ${duration(e.spanSec)}, staying within ${amount(e.altSpreadFt, 100, Math.ceil)} ft of the same altitude.`,
        commonly: "Aircraft sometimes fly circular patterns while waiting.",
        cannotTell: "The data alone can't confirm that it is waiting, or why.",
      };
    case "rapid_descent":
      return {
        seen: `This aircraft is descending unusually quickly, about ${amount(e.peakRateFpm, 100)} ft per minute.`,
        cannotTell: "This can happen for several reasons, and the data doesn't show which.",
      };
    case "signal_lost":
      return {
        seen: `No new position for ${duration(e.secondsSinceLastPosition)}.`,
        commonly: "This is usually a gap in receiver coverage, which is common over the ocean.",
        cannotTell: "It doesn't mean anything happened to the aircraft.",
      };
    case "glitch":
      return {
        seen: "One altitude reading was inconsistent and has been ignored.",
        commonly: "Single bad readings are a normal part of radio data.",
        cannotTell: "It doesn't reflect a real change in altitude.",
      };
    case "gap":
      return {
        seen: `No data between ${clock(e.gapStart, timeZone)} and ${clock(e.gapEnd, timeZone)}.`,
        cannotTell: "The line shows a gap, not the actual path.",
      };
    case "emergency":
      return {
        seen: "This aircraft is transmitting an emergency code.",
        cannotTell: "The code alone doesn't tell us the reason.",
      };
    case "takeoff":
      return {
        seen: `This aircraft took off ${where(e, timeZone)}.`,
        cannotTell: "The data doesn't show where it is going.",
      };
    case "landing":
      return {
        seen: `This aircraft landed ${where(e, timeZone)}.`,
        cannotTell: "The data doesn't show the flight's full route.",
      };
  }
}
