import { THRESHOLDS, type BehaviourEvent } from "@aerotrack/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWriter } from "../src/writer";
import { FakeRepo } from "./fakeRepo";
import { T0, obs, state } from "./helpers";

const opts = { flushMs: 5000, maxRows: 3, maxQueuedRows: 6 };
const silent = { warn: () => {}, error: () => {} };
const row = (i: number) => ({ hex: "7c0001", obs: obs(T0 + i), squawk: null, mode: "live" as const });

const event = (id: string, status: "open" | "closed" = "open"): BehaviourEvent => ({
  id,
  hex: "7c0001",
  type: "climb",
  confidence: "observed",
  windowStart: T0,
  windowEnd: T0 + 60,
  evidence: {},
  mode: "live",
  status,
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: T0,
  updatedAt: T0,
  closedAt: null,
});

describe("writer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flushes positions every flushMs", async () => {
    const repo = new FakeRepo();
    const w = createWriter(repo, opts, silent);
    w.start();
    w.addPositions([row(1)]);
    expect(repo.positions).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(opts.flushMs);
    expect(repo.positions).toHaveLength(1);
    await w.stop();
  });

  it("flushes early once maxRows positions are queued", async () => {
    const repo = new FakeRepo();
    const w = createWriter(repo, opts, silent);
    w.addPositions([row(1), row(2)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.positions).toHaveLength(0);
    w.addPositions([row(3)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.positions).toHaveLength(3);
  });

  it("keeps only the latest version of each aircraft and event per flush", async () => {
    const repo = new FakeRepo();
    const w = createWriter(repo, opts, silent);
    w.addAircraft([state("7c0001", obs(T0), { callsign: "OLD" })]);
    w.addAircraft([state("7c0001", obs(T0), { callsign: "NEW" })]);
    w.addEvents([event("e1")]);
    w.addEvents([event("e1", "closed")]);
    await w.flush();
    expect(repo.aircraft.get("7c0001")?.callsign).toBe("NEW");
    expect(repo.events.get("e1")?.status).toBe("closed");
    expect(repo.calls.filter((c) => c === "upsertEvents")).toHaveLength(1);
  });

  it("writes nothing when the queue is empty", async () => {
    const repo = new FakeRepo();
    await createWriter(repo, opts, silent).flush();
    expect(repo.calls).toEqual([]);
  });

  it("re-queues rows after a failed flush and writes them next time", async () => {
    const repo = new FakeRepo();
    const w = createWriter(repo, opts, silent);
    w.addPositions([row(1)]);
    w.addEvents([event("e1")]);
    repo.failNext = 1;
    await w.flush();
    expect(repo.positions).toHaveLength(0);
    await w.flush();
    expect(repo.positions).toHaveLength(1);
    expect(repo.events.has("e1")).toBe(true);
  });

  it("caps queued positions while the database is down, dropping the oldest", async () => {
    const repo = new FakeRepo();
    const warn = vi.fn();
    const w = createWriter(repo, { ...opts, maxRows: 100 }, { ...silent, warn });
    w.addPositions([1, 2, 3, 4, 5, 6, 7, 8].map(row));
    await w.flush();
    expect(repo.positions.map((p) => p.obs.t)).toEqual([3, 4, 5, 6, 7, 8].map((i) => T0 + i));
    expect(warn).toHaveBeenCalled();
  });

  it("stop() writes what is left", async () => {
    const repo = new FakeRepo();
    const w = createWriter(repo, opts, silent);
    w.start();
    w.addPositions([row(1)]);
    await w.stop();
    expect(repo.positions).toHaveLength(1);
  });

  it("never runs two flushes at once", async () => {
    const repo = new FakeRepo();
    let inFlight = 0;
    let maxInFlight = 0;
    repo.insertPositions = async (rows) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      repo.positions.push(...rows);
      inFlight--;
    };
    const w = createWriter(repo, opts, silent);
    w.addPositions([row(1)]);
    const a = w.flush();
    w.addPositions([row(2)]);
    const b = w.flush();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([a, b]);
    expect(maxInFlight).toBe(1);
    expect(repo.positions).toHaveLength(2);
  });

  it("uses the writer thresholds by default", () => {
    expect(THRESHOLDS.writer).toEqual({ flushMs: 5000, maxRows: 500 });
  });
});
