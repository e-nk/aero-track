import { z } from "zod";

// OpenSky /states/all (SPEC 5.8). Verified against docs/samples/opensky-states-au.json.
// Each state is a positional array; index 17 (category) is only present with extended=1.
export const StateRowSchema = z.tuple(
  [
    z.string().min(1), // 0 icao24
    z.string().nullable(), // 1 callsign
    z.string(), // 2 origin_country
    z.number().nullable(), // 3 time_position
    z.number(), // 4 last_contact
    z.number().nullable(), // 5 longitude
    z.number().nullable(), // 6 latitude
    z.number().nullable(), // 7 baro_altitude (m)
    z.boolean(), // 8 on_ground
    z.number().nullable(), // 9 velocity (m/s)
    z.number().nullable(), // 10 true_track
    z.number().nullable(), // 11 vertical_rate (m/s)
    z.unknown(), // 12 sensors
    z.number().nullable(), // 13 geo_altitude (m)
    z.string().nullable(), // 14 squawk
    z.boolean(), // 15 spi
    z.number(), // 16 position_source
  ],
  z.unknown(), // 17 category (extended=1), and anything added later
);

export type StateRow = z.infer<typeof StateRowSchema>;

const EnvelopeSchema = z.looseObject({
  time: z.number(),
  states: z.array(z.unknown()).nullable(),
});

export interface ParsedStates {
  time: number; // epoch seconds
  rows: StateRow[];
  rejected: number;
}

/** Throws if the envelope is invalid. A malformed row is skipped, not fatal. */
export function parseStates(body: unknown): ParsedStates {
  const env = EnvelopeSchema.parse(body);
  const rows: StateRow[] = [];
  let rejected = 0;
  for (const raw of env.states ?? []) {
    const r = StateRowSchema.safeParse(raw);
    if (r.success) rows.push(r.data);
    else rejected++;
  }
  return { time: env.time, rows, rejected };
}
