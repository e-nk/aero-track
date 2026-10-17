import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPoller } from "../src/poller";

const INTERVAL = 7000;
const MAX_BACKOFF = 60000;

/** stop() waits for the poll in flight, so let fake time run while it does. */
async function drainStop(p: { stop: () => Promise<void> }) {
  const stopped = p.stop();
  await vi.advanceTimersByTimeAsync(INTERVAL * 3);
  await stopped;
}

describe("poller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_792_200_000_000);
  });
  afterEach(() => vi.useRealTimers());

  const make = (run: () => Promise<void>, onError = vi.fn()) =>
    createPoller({ run, intervalMs: INTERVAL, maxBackoffMs: MAX_BACKOFF, onError });

  it("starts as degraded, polls immediately, then every interval", async () => {
    const run = vi.fn(async () => {});
    const p = make(run);
    expect(p.status().feedStatus).toBe("degraded");
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(p.status()).toMatchObject({ feedStatus: "ok", lastPollAt: 1_792_200_000_000 });
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(run).toHaveBeenCalledTimes(2);
    await p.stop();
  });

  it("subtracts the time a poll took (drift guard)", async () => {
    const run = vi.fn(() => new Promise<void>((r) => setTimeout(r, 2000)));
    const p = make(run);
    p.start();
    await vi.advanceTimersByTimeAsync(2000); // first poll done at t=2000
    await vi.advanceTimersByTimeAsync(INTERVAL - 2000 - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // next starts at t=7000
    expect(run).toHaveBeenCalledTimes(2);
    await drainStop(p);
  });

  it("never overlaps polls, even when one takes longer than the interval", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const run = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, INTERVAL * 2));
      inFlight--;
    });
    const p = make(run);
    p.start();
    await vi.advanceTimersByTimeAsync(INTERVAL * 7);
    expect(maxInFlight).toBe(1);
    await drainStop(p);
  });

  it("backs off exponentially up to maxBackoffMs and reports down", async () => {
    const onError = vi.fn();
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    const p = make(run, onError);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status()).toMatchObject({ feedStatus: "down", consecutiveFailures: 1 });

    const starts: number[] = [];
    run.mockImplementation(async () => {
      starts.push(Date.now() - 1_792_200_000_000);
      throw new Error("boom");
    });
    await vi.advanceTimersByTimeAsync(14000 + 28000 + 56000 + 60000 + 60000);
    expect(starts).toEqual([14000, 42000, 98000, 158000, 218000]);
    expect(onError).toHaveBeenCalledTimes(6);
    expect(onError.mock.calls[0]![1]).toBe(1);
    await p.stop();
  });

  it("returns to the normal interval and ok after a success", async () => {
    let fail = true;
    const run = vi.fn(async () => {
      if (fail) throw new Error("boom");
    });
    const p = make(run);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(14000);
    expect(p.status()).toMatchObject({ feedStatus: "ok", consecutiveFailures: 0 });
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(run).toHaveBeenCalledTimes(3);
    await p.stop();
  });

  it("keeps lastPollAt from the last success while down", async () => {
    let fail = false;
    const p = make(async () => {
      if (fail) throw new Error("boom");
    });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(p.status()).toMatchObject({ feedStatus: "down", lastPollAt: 1_792_200_000_000 });
    await p.stop();
  });

  it("stop() waits for the poll in flight and schedules nothing more", async () => {
    let finished = false;
    const run = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      finished = true;
    });
    const p = make(run);
    p.start();
    await vi.advanceTimersByTimeAsync(10);
    const stopped = p.stop();
    await vi.advanceTimersByTimeAsync(1000);
    await stopped;
    expect(finished).toBe(true);
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("start() twice does not start a second loop", async () => {
    const run = vi.fn(async () => {});
    const p = make(run);
    p.start();
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await p.stop();
  });
});
