import { readFileSync } from "node:fs";

/** Real OpenSky /states/all response for the Australia box, captured 2026-10-17. */
export const loadOpenSkySample = (): { time: number; states: unknown[][] | null } =>
  JSON.parse(readFileSync(new URL("../../../../../docs/samples/opensky-states-au.json", import.meta.url), "utf8"));
