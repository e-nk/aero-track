import { z } from "zod";

// adsb.lol v2 (readsb format). Verified against docs/samples/adsblol-point.json.
// Unknown fields pass through; only the fields the adapter reads are typed.

export const AircraftSchema = z.looseObject({
  hex: z.string().min(1),
  flight: z.string().optional(),
  r: z.string().optional(),
  t: z.string().optional(),
  desc: z.string().optional(),
  category: z.string().optional(),
  alt_baro: z.union([z.number(), z.literal("ground")]).optional(),
  alt_geom: z.number().optional(),
  gs: z.number().optional(),
  track: z.number().optional(),
  baro_rate: z.number().optional(),
  geom_rate: z.number().optional(),
  squawk: z.string().optional(),
  emergency: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  seen_pos: z.number().optional(),
  seen: z.number().optional(),
});

export const EnvelopeSchema = z.looseObject({
  ac: z.array(z.unknown()),
  now: z.number(), // epoch milliseconds
  msg: z.string().optional(),
  total: z.number().optional(),
});

export type AdsbLolAircraft = z.infer<typeof AircraftSchema>;

export interface ParsedResponse {
  now: number; // epoch milliseconds
  aircraft: AdsbLolAircraft[];
  rejected: number; // aircraft that failed the schema and were skipped
}

/** Throws if the envelope is invalid. A malformed aircraft is skipped, not fatal. */
export function parseResponse(body: unknown): ParsedResponse {
  const env = EnvelopeSchema.parse(body);
  const aircraft: AdsbLolAircraft[] = [];
  let rejected = 0;
  for (const raw of env.ac) {
    const r = AircraftSchema.safeParse(raw);
    if (r.success) aircraft.push(r.data);
    else rejected++;
  }
  return { now: env.now, aircraft, rejected };
}
