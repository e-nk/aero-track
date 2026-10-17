// Import one aircraft's trace from the ADSB.lol globe_history archive as a recording (SPEC 5.2, 8).
// Get the trace once, offline (never from the app or CI):
//   (curl -sL <tar.aa url>; curl -sL <tar.ab url>) | tar -xf - --occurrence=1 ./traces/<xx>/trace_full_<hex>.json
// Then:
//   pnpm --filter api recording:import -- --trace path/to/trace_full_<hex>.json --title "..." \
//     --from <time> --to <time> --cause cause.json [--out ../web/public/recordings] [--no-save]
// cause.json: { "text": "...", "sourceUrl": "...", "sourceName": "..." } (a published source, quoted carefully).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { ReportedCauseSchema, type RecordingMeta } from "@aerotrack/shared";
import { createDb } from "../src/db/client";
import { createPgRepo } from "../src/db/repo";
import { loadDotEnv } from "../src/env";
import { parseTraceFile, traceToRecording } from "../src/recordings/globeHistory";
import { mergeIndex, parseWhen } from "../src/recordings/offline";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    trace: { type: "string" },
    title: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    cause: { type: "string" },
    out: { type: "string" },
    "no-save": { type: "boolean", default: false },
  },
});
if (!values.trace || !values.title || !values.from || !values.to) {
  console.error('Usage: recording:import -- --trace file --title "..." --from <time> --to <time> [--cause cause.json] [--out dir] [--no-save]');
  process.exit(1);
}

// Trace files are gzip-compressed despite the .json extension (SPEC 5.2).
const raw = readFileSync(values.trace);
const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
const trace = parseTraceFile(JSON.parse(text));
const reportedCause = values.cause ? ReportedCauseSchema.parse(JSON.parse(readFileSync(values.cause, "utf8"))) : null;
const rec = traceToRecording(trace, { title: values.title, from: parseWhen(values.from), to: parseWhen(values.to), reportedCause });
const points = rec.aircraft.reduce((n, a) => n + a.points.length, 0);

if (!values["no-save"]) {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const { db, close } = createDb(url);
  try {
    await createPgRepo(db).saveRecording(rec);
  } finally {
    await close();
  }
}
if (values.out) {
  const dir = resolve(values.out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec));
  const indexPath = join(dir, "index.json");
  const index: RecordingMeta[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
  const { aircraft, ...meta } = rec;
  writeFileSync(indexPath, `${JSON.stringify(mergeIndex(index, { ...meta, aircraftCount: aircraft.length }), null, 2)}\n`);
}
console.log(
  `Recording ${rec.id}: ${rec.aircraft[0]?.callsign ?? "callsign not available"}, ${points} points` +
    `${values["no-save"] ? "" : ", saved to Postgres"}${values.out ? `, written to ${values.out}` : ""}`,
);
