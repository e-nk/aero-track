// Load the bundled recordings (apps/web/public/recordings) into a database, so the api serves them.
// A fresh database (e.g. a new deployment) starts with none. Safe to re-run: saving is an upsert.
// Usage: pnpm --filter api recording:seed   (uses DATABASE_URL)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRecording, type RecordingMeta } from "@aerotrack/shared";
import { createDb } from "../src/db/client";
import { createPgRepo } from "../src/db/repo";
import { loadDotEnv } from "../src/env";

const DIR = join(import.meta.dirname, "..", "..", "web", "public", "recordings");

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");
const index: RecordingMeta[] = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8"));
const { db, close } = createDb(url);
const repo = createPgRepo(db);
try {
  for (const meta of index) {
    // Validated like any other recording: never store something that isn't SPEC 8.
    const rec = parseRecording(JSON.parse(readFileSync(join(DIR, `${meta.id}.json`), "utf8")));
    await repo.saveRecording(rec);
    console.log(`Saved ${rec.id} (${rec.mode}, ${rec.aircraft.length} aircraft)`);
  }
  console.log(`Recordings in the database now: ${(await repo.listRecordings()).length}`);
} finally {
  await close();
}
