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

/** Second badge for the Australia-wide overview. Null when the overview is off. */
export function overviewBadge(o: LiveState["overview"], nowMs: number): Badge | null {
  if (!o) return null;
  if (o.feedStatus === "down") return { tone: "down", text: "Australia-wide data unavailable · showing the last update" };
  if (o.fetchedAt === null) return { tone: "pending", text: "Australia-wide · waiting for the first update" };
  const sec = Math.max(0, Math.floor((nowMs - o.receivedAtMs) / 1000));
  const ago = sec < 60 ? `${sec}s ago` : `${Math.round(sec / 60)} min ago`;
  return { tone: o.feedStatus === "degraded" ? "stale" : "live", text: `Australia-wide · updated ${ago}` };
}
