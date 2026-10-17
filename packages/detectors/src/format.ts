import type { Detection } from "@aerotrack/shared";

// Human formatting shared by explanation templates and evidence lists.
export const NA = "Not available";
const numberFormat = new Intl.NumberFormat("en-US");

export type EvidenceValue = Detection["evidence"][string] | undefined;

export const num = (v: EvidenceValue): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Absolute value rounded to the nearest step, with thousands separators. */
export function amount(v: EvidenceValue, step: number, round = Math.round): string {
  const n = num(v);
  return n === null ? NA : numberFormat.format(round(Math.abs(n) / step) * step);
}

/** "within N ft" is an upper bound: round up, and never claim less than 100 ft. */
export function spreadFt(v: EvidenceValue): string {
  const n = num(v);
  return n === null ? NA : amount(Math.max(100, n), 100, Math.ceil);
}

/** "40 seconds" (nearest 10 s) under a minute, otherwise "3 minutes" (nearest minute). */
export function formatDuration(sec: number): string {
  const tens = Math.round(sec / 10) * 10;
  if (tens < 60) return `${tens} seconds`;
  const min = Math.round(sec / 60);
  return min === 1 ? "1 minute" : `${min} minutes`;
}

export function duration(v: EvidenceValue): string {
  const n = num(v);
  return n === null ? NA : formatDuration(n);
}

/** Clock time like "12:20 pm" in the given time zone. */
export function clock(v: EvidenceValue, timeZone: string): string {
  const n = num(v);
  if (n === null) return NA;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(n * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}
