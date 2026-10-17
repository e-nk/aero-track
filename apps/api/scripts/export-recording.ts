// Export a recording (SPEC 8) from Postgres, save it, and optionally write an offline copy.
// Usage:
//   pnpm --filter api recording:export -- --title "Evening arrivals" \
//     --from 2026-10-17T18:00:00+11:00 --to 2026-10-17T18:15:00+11:00 \
//     [--hexes 7c6b2d,7c4a56] [--out ../web/public/recordings] [--no-save]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { RecordingMeta } from "@aerotrack/shared";
import { createDb } from "../src/db/client";
import { createPgRepo } from "../src/db/repo";
import { loadDotEnv } from "../src/env";
import { buildRecording } from "../src/recordings/export";
import { mergeIndex, parseWhen } from "../src/recordings/offline";

const { values } = parseArgs({
  // pnpm passes the "--" separator through; parseArgs would treat what follows as positional.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    title: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    hexes: { type: "string" },
    out: { type: "string" },
    "no-save": { type: "boolean", default: false },
  },
});
if (!values.title || !values.from || !values.to) {
  console.error('Usage: recording:export -- --title "..." --from <time> --to <time> [--hexes a,b] [--out dir] [--no-save]');
  process.exit(1);
}

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");
const { db, close } = createDb(url);
const repo = createPgRepo(db);

try {
  const from = parseWhen(values.from);
  const to = parseWhen(values.to);
  const rows = await repo.loadPositionsBetween(from, to);
  const identities = await repo.loadAircraft([...new Set(rows.map((r) => r.hex))]);
  const rec = buildRecording({ title: values.title, from, to, rows, identities, hexes: values.hexes?.split(",") });
  const points = rec.aircraft.reduce((n, a) => n + a.points.length, 0);

  if (!values["no-save"]) await repo.saveRecording(rec);
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
    `Recording ${rec.id}: ${rec.aircraft.length} aircraft, ${points} points` +
      `${values["no-save"] ? "" : ", saved to Postgres"}${values.out ? `, written to ${values.out}` : ""}`,
  );
} finally {
  await close();
}
