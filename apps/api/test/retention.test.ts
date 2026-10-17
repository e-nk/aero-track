import { THRESHOLDS } from "@aerotrack/shared";
import { describe, expect, it, vi } from "vitest";
import { Retention } from "../src/retention";
import { FakeRepo } from "./fakeRepo";
import { T0, obs } from "./helpers";

const keep = THRESHOLDS.retention.keepPositionsSec;
const row = (t: number) => ({ hex: "7c0001", obs: obs(t), squawk: null, callsign: null, mode: "live" as const });

describe("Retention", () => {
  it("deletes positions older than the keep window and reports how many", async () => {
    const repo = new FakeRepo();
    await repo.insertPositions([row(T0 - keep - 10), row(T0 - keep + 10), row(T0)]);
    const r = new Retention({ repo, thresholds: THRESHOLDS, nowSec: () => T0, log: { info: vi.fn(), warn: vi.fn() } });
    expect(await r.runOnce()).toBe(1);
    expect(repo.positions.map((p) => p.obs.t)).toEqual([T0 - keep + 10, T0]);
  });

  it("logs a failure instead of throwing, so the server keeps running", async () => {
    const repo = new FakeRepo();
    repo.failNext = 1;
    const warn = vi.fn();
    const r = new Retention({ repo, thresholds: THRESHOLDS, nowSec: () => T0, log: { info: vi.fn(), warn } });
    expect(await r.runOnce()).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("runs on its interval until stopped", async () => {
    vi.useFakeTimers();
    try {
      const repo = new FakeRepo();
      const spy = vi.spyOn(repo, "deletePositionsBefore");
      const r = new Retention({ repo, thresholds: THRESHOLDS, nowSec: () => T0, log: { info: vi.fn(), warn: vi.fn() } });
      r.start();
      await vi.advanceTimersByTimeAsync(THRESHOLDS.retention.intervalMs * 2);
      r.stop();
      await vi.advanceTimersByTimeAsync(THRESHOLDS.retention.intervalMs * 2);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
