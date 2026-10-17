import type { RecordingMeta } from "@aerotrack/shared";

/** Epoch seconds from "1792200000" or an ISO time like "2026-10-17T12:20:00+11:00". */
export function parseWhen(value: string): number {
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Not a time: ${value} (use epoch seconds or ISO 8601)`);
  return ms / 1000;
}

/** Offline index.json: one entry per recording, replaced by id, newest first. */
export function mergeIndex(index: RecordingMeta[], meta: RecordingMeta): RecordingMeta[] {
  return [...index.filter((m) => m.id !== meta.id), meta].sort((a, b) => b.capturedFrom - a.capturedFrom);
}
