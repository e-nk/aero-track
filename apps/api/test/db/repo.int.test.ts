// Integration test against real Postgres. Needs TEST_DATABASE_URL (see .env.example and
// docker-compose.yml). Skipped when it isn't set.
import type { BehaviourEvent } from "@aerotrack/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/client";
import { runMigrations } from "../../src/db/migrate";
import { createPgRepo } from "../../src/db/repo";
import { loadDotEnv } from "../../src/env";
import { T0, obs, state } from "../helpers";

loadDotEnv();
const url = process.env.TEST_DATABASE_URL;

const event = (id: string, patch: Partial<BehaviourEvent> = {}): BehaviourEvent => ({
  id,
  hex: "7c0001",
  type: "climb",
  confidence: "observed",
  windowStart: T0,
  windowEnd: T0 + 60.5,
  evidence: { netFt: 3000, direction: "up", ok: true },
  mode: "live",
  status: "open",
  explanation: { seen: "This aircraft has climbed 3,000 ft.", commonly: "c", cannotTell: "t" },
  explanationSource: "template",
  openedAt: T0,
  updatedAt: T0,
  closedAt: null,
  ...patch,
});

describe.skipIf(!url)("Postgres repo", () => {
  const { db, close } = createDb(url ?? "");
  const repo = createPgRepo(db);

  beforeAll(async () => {
    await runMigrations(url!);
  });
  beforeEach(async () => {
    await db.execute(sql`truncate positions, aircraft, events, recordings restart identity`);
  });
  afterAll(async () => {
    await close();
  });

  it("round-trips positions exactly, oldest first", async () => {
    const a = obs(T0 + 7.019, { altFt: null, gsKt: 245.2, trackDeg: 76.08, baroRateFpm: null, lat: -34.020655 });
    const b = obs(T0, { onGround: true, altFt: 0 });
    await repo.insertPositions([
      { hex: "7c0001", obs: a, squawk: "6773", mode: "live" },
      { hex: "7c0001", obs: b, squawk: null, mode: "live" },
    ]);
    expect(await repo.loadPositionsSince(T0)).toEqual([
      { hex: "7c0001", obs: b, squawk: null },
      { hex: "7c0001", obs: a, squawk: "6773" },
    ]);
    expect(await repo.loadPositionsSince(T0 + 1)).toHaveLength(1);
  });

  it("ignores a duplicate position for the same aircraft and time", async () => {
    const row = { hex: "7c0001", obs: obs(T0), squawk: null, mode: "live" as const };
    await repo.insertPositions([row]);
    await repo.insertPositions([row, { ...row, obs: obs(T0 + 7) }]);
    expect(await repo.loadPositionsSince(0)).toHaveLength(2);
  });

  it("loads only live positions for hydration", async () => {
    await repo.insertPositions([{ hex: "7c0001", obs: obs(T0), squawk: null, mode: "recorded" }]);
    expect(await repo.loadPositionsSince(0)).toEqual([]);
  });

  it("upserts aircraft identity", async () => {
    await repo.upsertAircraft([state("7c0001", obs(T0), { callsign: "OLD" })]);
    await repo.upsertAircraft([state("7c0001", obs(T0 + 7), { callsign: "NEW", registration: "VH-ABC" })]);
    expect(await repo.loadAircraft(["7c0001", "7cffff"])).toEqual([
      { hex: "7c0001", callsign: "NEW", registration: "VH-ABC", typeCode: "B738", typeDesc: null, category: "A3" },
    ]);
  });

  it("round-trips events and updates them in place", async () => {
    await repo.upsertEvents([event("6b1f8c2e-0000-4000-8000-000000000001")]);
    const closed = event("6b1f8c2e-0000-4000-8000-000000000001", {
      status: "closed",
      closedAt: T0 + 120,
      updatedAt: T0 + 120,
      evidence: { netFt: 3500 },
    });
    await repo.upsertEvents([closed]);
    expect(await repo.recentEvents("7c0001", 10)).toEqual([closed]);
  });

  it("loads open events only", async () => {
    await repo.upsertEvents([
      event("6b1f8c2e-0000-4000-8000-000000000001"),
      event("6b1f8c2e-0000-4000-8000-000000000002", { status: "closed", closedAt: T0 + 60 }),
    ]);
    expect((await repo.loadOpenEvents()).map((e) => e.id)).toEqual(["6b1f8c2e-0000-4000-8000-000000000001"]);
  });

  it("returns recent events newest first, limited, for one aircraft", async () => {
    await repo.upsertEvents([
      event("6b1f8c2e-0000-4000-8000-000000000001", { openedAt: T0 }),
      event("6b1f8c2e-0000-4000-8000-000000000002", { openedAt: T0 + 100 }),
      event("6b1f8c2e-0000-4000-8000-000000000003", { openedAt: T0 + 200 }),
      event("6b1f8c2e-0000-4000-8000-000000000004", { hex: "7c0002" }),
    ]);
    expect((await repo.recentEvents("7c0001", 2)).map((e) => e.id.slice(-1))).toEqual(["3", "2"]);
  });

  it("accepts empty batches", async () => {
    await repo.insertPositions([]);
    await repo.upsertAircraft([]);
    await repo.upsertEvents([]);
    expect(await repo.loadAircraft([])).toEqual([]);
  });
});
