import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS, type Observation } from "@aerotrack/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { AircraftStore } from "../src/buffer";
import type { PollerStatus } from "../src/poller";
import { FollowList } from "../src/follows";
import { SightingTracker } from "../src/sightings";
import { SseHub } from "../src/sse";
import { FakeRepo } from "./fakeRepo";
import { T0, obs, state } from "./helpers";

function setup(status: PollerStatus = { feedStatus: "ok", lastPollAt: T0 * 1000, consecutiveFailures: 0 }) {
  const store = new AircraftStore(THRESHOLDS);
  const repo = new FakeRepo();
  const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => "ev-1" });
  let now = T0;
  const sightings = new SightingTracker({ keepSec: THRESHOLDS.buffer.keepSec, newId: () => "open-sighting" });
  const follows = new FollowList({ ...THRESHOLDS.follow, maxFollowed: 2 });
  const hub = new SseHub(THRESHOLDS.sse);
  const app = buildApp({
    store,
    lifecycle,
    repo,
    hub,
    follows,
    sightings,
    overview: null,
    status: () => status,
    nowSec: () => now,
    corsOrigin: ["http://localhost:3000"],
    logger: false,
  });
  return { app, store, repo, lifecycle, sightings, follows, hub, setNow: (t: number) => (now = t) };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

function track(store: AircraftStore, hex: string, times: number[]) {
  for (const t of times) store.ingest([state(hex, obs(t))]);
}

describe("api routes", () => {
  it("GET /health", async () => {
    const { app, store } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0]);
    const res = await app.inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, feedStatus: "ok", lastPollAt: T0 * 1000, aircraftCount: 1, overview: { enabled: false } });
  });

  it("GET /health reports the overview as disabled when OpenSky isn't configured", async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject("/health")).json().overview).toEqual({ enabled: false });
  });

  it("GET /health reports a down feed but stays 200", async () => {
    const { app } = setup({ feedStatus: "down", lastPollAt: null, consecutiveFailures: 3 });
    close = () => app.close();
    const res = await app.inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ feedStatus: "down", lastPollAt: null });
  });

  it("GET /api/aircraft returns the current snapshot", async () => {
    const { app, store } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0]);
    track(store, "7c0002", [T0]);
    const res = await app.inject("/api/aircraft");
    expect(res.json().map((s: { hex: string }) => s.hex).sort()).toEqual(["7c0001", "7c0002"]);
    expect(res.json()[0]).toHaveProperty("mode", "live");
  });

  it("GET /api/aircraft/:hex returns state, open and recent events", async () => {
    const { app, store, repo, lifecycle } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0]);
    const [ev] = lifecycle.step(
      "7c0001",
      [{ type: "turn", confidence: "observed", windowStart: T0, windowEnd: T0, evidence: { totalDeg: 40 } }],
      T0,
    ).opened;
    await repo.upsertEvents([{ ...ev!, id: "old", status: "closed", closedAt: T0 - 100, openedAt: T0 - 200 }]);

    const res = await app.inject("/api/aircraft/7c0001");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state.hex).toBe("7c0001");
    expect(body.openEvents.map((e: { id: string }) => e.id)).toEqual(["ev-1"]);
    expect(body.recentEvents.map((e: { id: string }) => e.id)).toEqual(["old"]);
  });

  it("GET /api/aircraft/:hex says when there isn't enough history for insights", async () => {
    const { app, store } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0, T0 + 7]);
    expect((await app.inject("/api/aircraft/7c0001")).json().history).toBe("insufficient_history");
    track(store, "7c0001", [T0 + 14, T0 + 21, T0 + 63]);
    expect((await app.inject("/api/aircraft/7c0001")).json().history).toBe("ok");
  });

  it("GET /api/aircraft/:hex counts sightings, including the current one not yet saved", async () => {
    const { app, store, repo, sightings } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0]);
    await repo.upsertSightings([
      { id: "older", hex: "7c0001", startedAt: T0 - 3 * 86400, lastSeenAt: T0 - 3 * 86400 + 600, tookOffAt: null, takeoffAirport: null, landedAt: null, landingAirport: null },
      { id: "ancient", hex: "7c0001", startedAt: T0 - 30 * 86400, lastSeenAt: T0 - 30 * 86400 + 600, tookOffAt: null, takeoffAirport: null, landedAt: null, landingAirport: null },
    ]);
    sightings.touch("7c0001", T0);
    expect((await app.inject("/api/aircraft/7c0001")).json().sightings).toEqual({
      last7Days: 2,
      total: 3,
      firstSeenAt: T0 - 30 * 86400,
    });
  });

  it("GET /api/aircraft/:hex is 404 for an aircraft we can't see", async () => {
    const { app } = setup();
    close = () => app.close();
    const res = await app.inject("/api/aircraft/7cffff");
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/can't see this aircraft/);
  });

  it("GET /api/aircraft/:hex/track returns segments split at gaps", async () => {
    const { app, store, setNow } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0, T0 + 7, T0 + 14, T0 + 200, T0 + 207]);
    setNow(T0 + 207);
    const res = await app.inject("/api/aircraft/7c0001/track");
    expect(res.statusCode).toBe(200);
    const segments: Observation[][] = res.json().segments;
    expect(segments.map((s) => s.map((o) => o.t - T0))).toEqual([[0, 7, 14], [200, 207]]);
  });

  it("GET /api/aircraft/:hex/track?minutes limits the window", async () => {
    const { app, store, setNow } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0, T0 + 60, T0 + 120, T0 + 180]);
    setNow(T0 + 180);
    const res = await app.inject("/api/aircraft/7c0001/track?minutes=2");
    expect(res.json().segments.flat().map((o: Observation) => o.t - T0)).toEqual([60, 120, 180]);
  });

  it.each(["0", "16", "abc"])("GET /track rejects minutes=%s", async (m) => {
    const { app, store } = setup();
    close = () => app.close();
    track(store, "7c0001", [T0]);
    expect((await app.inject(`/api/aircraft/7c0001/track?minutes=${m}`)).statusCode).toBe(400);
  });

  it("GET /track is 404 for an unknown aircraft", async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject("/api/aircraft/7cffff/track")).statusCode).toBe(404);
  });

  it("follows: add, list, refuse when full, remove", async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject("/api/follows")).json()).toEqual({ max: 2, follows: [] });

    const added = await app.inject({ method: "POST", url: "/api/follows/7C0001" });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toEqual({ result: "added", max: 2, follows: [{ hex: "7c0001", addedAt: T0, landedAt: null }] });
    expect((await app.inject({ method: "POST", url: "/api/follows/7c0001" })).json().result).toBe("exists");

    await app.inject({ method: "POST", url: "/api/follows/7c0002" });
    const full = await app.inject({ method: "POST", url: "/api/follows/7c0003" });
    expect(full.statusCode).toBe(409);
    expect(full.json().message).toBe("Following is full right now (2 flights). Try again later.");

    expect((await app.inject({ method: "POST", url: "/api/follows/nothex" })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: "/api/follows/7c0001" })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: "/api/follows/7c0001" })).statusCode).toBe(404);
    expect((await app.inject("/api/follows")).json().follows.map((f: { hex: string }) => f.hex)).toEqual(["7c0002"]);
  });

  it("follows: tells every viewer when the list changes", async () => {
    const { app, hub } = setup();
    close = () => app.close();
    const sent: [string, unknown][] = [];
    hub.broadcast = (event: string, data: unknown) => void sent.push([event, data]);
    await app.inject({ method: "POST", url: "/api/follows/7c0001" });
    await app.inject({ method: "DELETE", url: "/api/follows/7c0001" });
    expect(sent.map(([e]) => e)).toEqual(["follows", "follows"]);
    expect(sent[1]![1]).toEqual({ max: 2, follows: [] });
  });

  it("allows POST and DELETE from the configured origin (CORS preflight)", async () => {
    const { app } = setup();
    close = () => app.close();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/follows/7c0001",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
    });
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(res.headers["access-control-allow-methods"]).toMatch(/DELETE/);
  });

  it("allows the configured CORS origin only", async () => {
    const { app } = setup();
    close = () => app.close();
    const ok = await app.inject({ url: "/health", headers: { origin: "http://localhost:3000" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const other = await app.inject({ url: "/health", headers: { origin: "https://evil.example" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
