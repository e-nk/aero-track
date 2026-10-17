import { z } from "zod";
import type { Observation } from "./types";

// Recording file format (SPEC 8). Shared by the api (export) and the web (replay).

/** [t, lat, lon, altFt|null, gsKt|null, trackDeg|null, baroRateFpm|null, onGround, squawk|null] */
export const RecordingPointSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number().nullable(),
  z.number().nullable(),
  z.number().nullable(),
  z.number().nullable(),
  z.boolean(),
  z.string().nullable(),
]);

export const RecordingAircraftSchema = z.object({
  hex: z.string().min(1),
  callsign: z.string().nullable(),
  registration: z.string().nullable(),
  typeCode: z.string().nullable(),
  category: z.string().nullable(),
  points: z.array(RecordingPointSchema),
});

export const ReportedCauseSchema = z.object({
  text: z.string(),
  sourceUrl: z.string(),
  sourceName: z.string(),
});

export const RecordingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  // Recordings are never live data, so modes can't mix (rule 3).
  mode: z.enum(["recorded", "fixture"]),
  source: z.string(),
  attribution: z.string(),
  capturedFrom: z.number(),
  capturedTo: z.number(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  reportedCause: ReportedCauseSchema.nullable(),
  aircraft: z.array(RecordingAircraftSchema),
});

export type RecordingPoint = z.infer<typeof RecordingPointSchema>;
export type RecordingAircraft = z.infer<typeof RecordingAircraftSchema>;
export type RecordingFile = z.infer<typeof RecordingSchema>;
export type RecordingMeta = Omit<RecordingFile, "aircraft"> & { aircraftCount: number };

/** Validates a recording loaded from the api or a file. Throws if it doesn't match SPEC 8. */
export const parseRecording = (body: unknown): RecordingFile => RecordingSchema.parse(body);

export function pointToObservation(p: RecordingPoint): Observation {
  const [t, lat, lon, altFt, gsKt, trackDeg, baroRateFpm, onGround] = p;
  return { t, lat, lon, altFt, onGround, gsKt, trackDeg, baroRateFpm };
}
