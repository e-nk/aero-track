import { describe, expect, it } from "vitest";
import { liveBadge } from "../lib/badge";
import { initialLiveState, type LiveState } from "../lib/liveState";

const STALE = 30;
const at = (patch: Partial<LiveState>): LiveState => ({ ...initialLiveState, ...patch });

describe("liveBadge", () => {
  it("is pending before the first snapshot", () => {
    expect(liveBadge(at({ connection: "connecting" }), 0, STALE)).toEqual({
      tone: "pending",
      text: "Connecting to live data…",
    });
  });

  it("shows how long ago the last update arrived", () => {
    const s = at({ connection: "open", feedStatus: "ok", lastSnapshotAt: 10_000 });
    expect(liveBadge(s, 15_400, STALE)).toEqual({ tone: "live", text: "Live · updated 5s ago" });
  });

  it("turns stale after staleAfterSec without an update", () => {
    const s = at({ connection: "open", feedStatus: "ok", lastSnapshotAt: 0 });
    expect(liveBadge(s, 31_000, STALE)).toEqual({ tone: "stale", text: "Live · updated 31s ago" });
  });

  it("says when the server is still waiting for its first poll", () => {
    const s = at({ connection: "open", feedStatus: "degraded", lastSnapshotAt: 0 });
    expect(liveBadge(s, 1000, STALE)).toEqual({ tone: "pending", text: "Live · waiting for the first update" });
  });

  it("says when the live feed is down", () => {
    const s = at({ connection: "open", feedStatus: "down", lastSnapshotAt: 0 });
    expect(liveBadge(s, 1000, STALE)).toEqual({
      tone: "down",
      text: "Live feed unavailable · showing last known positions",
    });
  });

  it("says when AeroTrack itself can't be reached", () => {
    const s = at({ connection: "reconnecting", feedStatus: "ok", lastSnapshotAt: 0 });
    expect(liveBadge(s, 1000, STALE)).toEqual({
      tone: "down",
      text: "Can't reach AeroTrack right now · showing last known positions",
    });
  });
});
