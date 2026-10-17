import { DISPLAY_TIME_ZONE, type Detection } from "@aerotrack/shared";
import { amount, clock, duration, num, type EvidenceValue } from "./format";

// "How we know": the evidence behind an event, in plain words. Facts only.
// A line is left out when the evidence it needs is missing.

export interface EvidenceOptions {
  timeZone?: string;
}

const has = (...values: EvidenceValue[]) => values.every((v) => num(v) !== null);

function latLon(lat: number, lon: number): string {
  const ns = lat < 0 ? "S" : "N";
  const ew = lon < 0 ? "W" : "E";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function describeEvidence(d: Detection, opts: EvidenceOptions = {}): string[] {
  const e = d.evidence;
  const timeZone = opts.timeZone ?? DISPLAY_TIME_ZONE;
  const lines: (string | false)[] = [];

  switch (d.type) {
    case "climb":
    case "descent":
      lines.push(
        has(e.startAltFt, e.endAltFt) && `Altitude went from ${amount(e.startAltFt, 100)} ft to ${amount(e.endAltFt, 100)} ft.`,
        has(e.spanSec, e.obs) && `Over ${duration(e.spanSec)}, from ${e.obs} position reports.`,
        has(e.avgRateFpm) && `Average rate about ${amount(e.avgRateFpm, 100)} ft per minute.`,
        e.basis === "altitude" && "Based on the altitude the aircraft reports.",
        e.basis === "vertical_rate" && "Based on the vertical speed the aircraft reports.",
      );
      break;
    case "turn":
      lines.push(
        has(e.totalDeg) && typeof e.direction === "string" &&
          `Direction of travel changed by ${amount(e.totalDeg, 1)}° to the ${e.direction}.`,
        has(e.spanSec) && `Over ${duration(e.spanSec)}.`,
        "Very small changes are ignored as noise.",
      );
      break;
    case "circling": {
      const laps = num(e.laps);
      lines.push(
        has(e.totalDeg) &&
          `Turned through ${amount(e.totalDeg, 1)}° in total${laps ? `, about ${laps} full circle${laps === 1 ? "" : "s"}` : ""}.`,
        has(e.spanSec) && `Over ${duration(e.spanSec)}.`,
        // "within" is an upper bound, so round up.
        has(e.altSpreadFt) && `Altitude stayed within ${amount(e.altSpreadFt, 100, Math.ceil)} ft.`,
      );
      break;
    }
    case "rapid_descent":
      lines.push(
        has(e.peakRateFpm) && `Fastest descent about ${amount(e.peakRateFpm, 100)} ft per minute.`,
        has(e.avgRateFpm) && `Average about ${amount(e.avgRateFpm, 100)} ft per minute.`,
        has(e.startAltFt, e.endAltFt) && `Altitude went from ${amount(e.startAltFt, 100)} ft to ${amount(e.endAltFt, 100)} ft.`,
        has(e.spanSec) && `Over ${duration(e.spanSec)}.`,
      );
      break;
    case "signal_lost":
      lines.push(
        has(e.secondsSinceLastPosition) && `Last position received ${duration(e.secondsSinceLastPosition)} ago.`,
        has(e.lastAltFt) && `Last known altitude ${amount(e.lastAltFt, 100)} ft.`,
        has(e.lastLat, e.lastLon) && `Last known position ${latLon(num(e.lastLat)!, num(e.lastLon)!)}.`,
      );
      break;
    case "glitch": {
      const count = num(e.count);
      lines.push(
        has(e.glitchAltFt, e.expectedAltFt) &&
          `One reading showed ${amount(e.glitchAltFt, 100)} ft while the readings around it were about ${amount(e.expectedAltFt, 100)} ft.`,
        has(e.impliedRateFpm) &&
          `That change would need about ${amount(e.impliedRateFpm, 100)} ft per minute, and the next reading returned to normal.`,
        count !== null && count > 1 && `This happened ${count} times in the recent track.`,
      );
      break;
    }
    case "gap":
      lines.push(
        has(e.gapSec) && `No position reports for ${duration(e.gapSec)}.`,
        has(e.gapStart, e.gapEnd) && `From ${clock(e.gapStart, timeZone)} to ${clock(e.gapEnd, timeZone)}.`,
      );
      break;
    case "emergency":
      lines.push(
        typeof e.squawk === "string" && `Transponder code ${e.squawk}.`,
        typeof e.emergency === "string" && e.emergency !== "none" && `Emergency status reported by the aircraft: ${e.emergency}.`,
      );
      break;
  }
  return lines.filter((l): l is string => typeof l === "string");
}
