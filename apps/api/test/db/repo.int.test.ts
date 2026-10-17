// Integration test against real Postgres. Needs TEST_DATABASE_URL (see .env.example and
// docker-compose.yml). Skipped when it isn't set.
import type { BehaviourEvent } from "@aerotrack/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/client";
import { runMigrations } from "../../src/db/migrate";
import { createPgRepo } from "../../src/db/repo";
import { loadDotEnv } from "../../src/env";
import type { Sighting } from "../../src/sightings";
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
    await db.execute(sql`truncate positions, aircraft, events, recordings, sightings restart identity`);
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

  const sighting = (id: string, startedAt: number, patch: Partial<Sighting> = {}): Sighting => ({
    id,
    hex: "7c0001",
    startedAt,
    lastSeenAt: startedAt + 600,
    tookOffAt: null,
    takeoffAirport: null,
    landedAt: null,
    landingAirport: null,
    ...patch,
  });

  it("upserts sightings and summarises them for one aircraft", async () => {
    const DAY = 86400;
    await repo.upsertSightings([
      sighting("6b1f8c2e-0000-4000-8000-0000000000a1", T0 - 10 * DAY),
      sighting("6b1f8c2e-0000-4000-8000-0000000000a2", T0 - 2 * DAY, { tookOffAt: T0 - 2 * DAY + 30, takeoffAirport: "YSSY" }),
      sighting("6b1f8c2e-0000-4000-8000-0000000000a3", T0 - DAY),
      sighting("6b1f8c2e-0000-4000-8000-0000000000b1", T0 - DAY, { hex: "7c0002" }),
    ]);
    await repo.upsertSightings([sighting("6b1f8c2e-0000-4000-8000-0000000000a3", T0 - DAY, { lastSeenAt: T0 })]);

    const summary = await repo.sightingSummary("7c0001", T0 - 7 * DAY);
    expect(summary.total).toBe(3);
    expect(summary.firstSeenAt).toBe(T0 - 10 * DAY);
    expect(summary.recentIds.sort()).toEqual(["6b1f8c2e-0000-4000-8000-0000000000a2", "6b1f8c2e-0000-4000-8000-0000000000a3"]);
    expect(await repo.sightingSummary("7cffff", 0)).toEqual({ total: 0, firstSeenAt: null, recentIds: [] });
  });

  it("loads sightings still open (seen since a time) to continue after a restart", async () => {
    const open = sighting("6b1f8c2e-0000-4000-8000-0000000000c1", T0, { lastSeenAt: T0 + 600, landedAt: T0 + 500, landingAirport: "YSBK" });
    await repo.upsertSightings([open, sighting("6b1f8c2e-0000-4000-8000-0000000000c2", T0 - 5000, { lastSeenAt: T0 - 4000 })]);
    expect(await repo.loadOpenSightings(T0)).toEqual([open]);
  });

  it("accepts empty batches", async () => {
    await repo.insertPositions([]);
    await repo.upsertAircraft([]);
    await repo.upsertEvents([]);
    await repo.upsertSightings([]);
    expect(await repo.loadAircraft([])).toEqual([]);
  });
});
