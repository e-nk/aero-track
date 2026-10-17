import { readFileSync } from "node:fs";

/** Real adsb.lol response captured 2026-10-17 (docs/samples/adsblol-point.json). */
export const SAMPLE_URL = new URL("../../../../../docs/samples/adsblol-point.json", import.meta.url);

export const loadSample = (): { now: number; ac: Record<string, unknown>[] } & Record<string, unknown> =>
  JSON.parse(readFileSync(SAMPLE_URL, "utf8"));
