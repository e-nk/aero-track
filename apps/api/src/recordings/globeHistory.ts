import type { RecordingFile } from "@aerotrack/shared";
import { z } from "zod";
import type { StoredPosition } from "../repo";
import { buildRecording } from "./export";

// ADSB.lol globe_history trace (readsb trace_full_<hex>.json, SPEC 5.2) -> recording (SPEC 8).
// Pure: the import script does the file handling.

const num = z.number().nullable();
// [offset, lat, lon, alt|"ground"|null, gs, track, flags, baroRate, details|null, source, geomAlt, geomRate, ias, roll]
const TracePointSchema = z
  .tuple([z.number(), z.number(), z.number(), z.union([z.number(), z.literal("ground")]).nullable(), num, num, z.number(), num])
  .rest(z.unknown());
const DetailsSchema = z.looseObject({
  flight: z.string().optional(),
  squawk: z.string().optional(),
  category: z.string().optional(),
});

export const TraceFileSchema = z.looseObject({
  icao: z.string().min(1),
  r: z.string().optional(),
  t: z.string().optional(),
  timestamp: z.number(),
  trace: z.array(TracePointSchema),
});
export type TraceFile = z.infer<typeof TraceFileSchema>;

export const parseTraceFile = (body: unknown): TraceFile => TraceFileSchema.parse(body);

const FLAG_GEOMETRIC_ALT = 8;

export interface TraceImportOptions {
  title: string;
  from: number; // epoch seconds
  to: number;
  reportedCause: RecordingFile["reportedCause"];
}

export function traceToRecording(file: TraceFile, opts: TraceImportOptions): RecordingFile {
  const rows: StoredPosition[] = [];
  let callsign: string | null = null;
  let squawk: string | null = null;
  let category: string | null = null;
  for (const p of file.trace) {
    // Details appear on only some points: carry the last values forward (SPEC 5.2).
    const details = DetailsSchema.safeParse(p[8]);
    if (details.success) {
      if (details.data.flight !== undefined) callsign = details.data.flight.trim() || null;
      if (details.data.squawk !== undefined) squawk = details.data.squawk || null;
      if (details.data.category !== undefined) category = details.data.category || null;
    }
    const [offset, lat, lon, alt, gsKt, trackDeg, flags, baroRateFpm] = p;
    const t = Math.round((file.timestamp + offset) * 10) / 10;
    if (t < opts.from || t > opts.to) continue;
    const onGround = alt === "ground";
    // Barometric altitude only, like the live detectors: drop geometric values.
    const altFt = onGround ? 0 : typeof alt === "number" && !(flags & FLAG_GEOMETRIC_ALT) ? alt : null;
    rows.push({ hex: file.icao, obs: { t, lat, lon, altFt, onGround, gsKt, trackDeg, baroRateFpm }, squawk, callsign });
  }

  const rec = buildRecording({
    title: opts.title,
    from: opts.from,
    to: opts.to,
    rows,
    identities: [{ hex: file.icao, callsign: null, registration: file.r ?? null, typeCode: file.t ?? null, category }],
    source: "ADSB.lol globe_history archive",
  });
  return { ...rec, reportedCause: opts.reportedCause };
}
