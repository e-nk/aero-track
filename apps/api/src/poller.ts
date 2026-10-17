import type { FeedStatus } from "@aerotrack/shared";

export interface PollerOptions {
  run: () => Promise<void>;
  intervalMs: number;
  maxBackoffMs: number;
  /** Consecutive failures before the feed counts as down. Fewer just mean "degraded". */
  downAfterFailures: number;
  onError: (err: unknown, consecutiveFailures: number) => void;
  /** Called when feedStatus changes (not on every poll). */
  onStatusChange?: (status: PollerStatus) => void;
}

export interface PollerStatus {
  feedStatus: FeedStatus;
  lastPollAt: number | null; // epoch ms of the last successful poll
  consecutiveFailures: number;
}

/**
 * One poll at a time (SPEC 11.1). The next poll is scheduled after the current
 * one finishes, so polls never overlap. Failures back off exponentially.
 * One missed poll is "degraded" (data getting old); downAfterFailures in a row is "down".
 */
export function createPoller(opts: PollerOptions) {
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  const status: PollerStatus = { feedStatus: "degraded", lastPollAt: null, consecutiveFailures: 0 };

  function setFeedStatus(next: FeedStatus) {
    const changed = status.feedStatus !== next;
    status.feedStatus = next;
    if (changed) opts.onStatusChange?.({ ...status });
  }

  async function tick() {
    const started = Date.now();
    let delay: number;
    try {
      inFlight = opts.run();
      await inFlight;
      status.lastPollAt = Date.now();
      status.consecutiveFailures = 0;
      setFeedStatus("ok");
      delay = Math.max(0, opts.intervalMs - (Date.now() - started));
    } catch (err) {
      status.consecutiveFailures++;
      setFeedStatus(status.consecutiveFailures >= opts.downAfterFailures ? "down" : "degraded");
      opts.onError(err, status.consecutiveFailures);
      delay = Math.min(opts.maxBackoffMs, opts.intervalMs * 2 ** status.consecutiveFailures);
      // Respect a provider's own "retry after" (e.g. OpenSky when credits run out).
      const retryAfterSec = (err as { retryAfterSec?: unknown } | null)?.retryAfterSec;
      if (typeof retryAfterSec === "number" && retryAfterSec > 0) delay = Math.max(delay, retryAfterSec * 1000);
    } finally {
      inFlight = undefined;
    }
    if (running) timer = setTimeout(tick, delay);
  }

  return {
    start() {
      if (running) return;
      running = true;
      timer = setTimeout(tick, 0);
    },
    async stop() {
      running = false;
      clearTimeout(timer);
      await inFlight?.catch(() => {});
    },
    status: (): PollerStatus => ({ ...status }),
  };
}

export type Poller = ReturnType<typeof createPoller>;
