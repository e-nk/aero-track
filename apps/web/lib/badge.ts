import type { LiveState } from "./liveState";

export type BadgeTone = "pending" | "live" | "stale" | "down";

export interface Badge {
  tone: BadgeTone;
  text: string;
}

/** Text and tone for the live mode badge (SPEC 12.2). Uses the browser clock only. */
export function liveBadge(s: LiveState, nowMs: number, staleAfterSec: number): Badge {
  if (s.connection === "reconnecting") {
    return { tone: "down", text: "Can't reach AeroTrack right now · showing last known positions" };
  }
  if (s.lastSnapshotAt === null) return { tone: "pending", text: "Connecting to live data…" };
  if (s.feedStatus === "down") return { tone: "down", text: "Live feed unavailable · showing last known positions" };
  if (s.feedStatus !== "ok" && s.lastPollAt === null) return { tone: "pending", text: "Live · waiting for the first update" };

  // "degraded" = a poll or two failed: not an outage, just data getting older.
  const ago = Math.max(0, Math.floor((nowMs - s.lastSnapshotAt) / 1000));
  const stale = s.feedStatus === "degraded" || ago > staleAfterSec;
  return { tone: stale ? "stale" : "live", text: `Live · updated ${ago}s ago` };
}
