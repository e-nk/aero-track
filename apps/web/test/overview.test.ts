import { THRESHOLDS, toOverviewCompact, type OverviewAircraft } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { overviewBadge } from "../lib/badge";
import { coverageCircle } from "../lib/coverage";
import { applyOverview, initialLiveState, type LiveState } from "../lib/liveState";
import { buildOverviewFeatures } from "../lib/overviewFeatures";

const T = 1_792_240_000;
const plane = (hex: string, patch: Partial<OverviewAircraft> = {}): OverviewAircraft => ({
  hex,
  callsign: "RBA4070",
  lat: -22,
  lon: 148,
  altFt: 37075,
  altGeomFt: null,
  gsKt: 250,
  trackDeg: 0,
  baroRateFpm: 0,
  onGround: false,
  lastPosTs: T,
  ...patch,
});

describe("applyOverview", () => {
  it("stores the overview with timing, keyed by hex", () => {
    const s = applyOverview(initialLiveState, { fetchedAt: T, feedStatus: "ok", aircraft: [toOverviewCompact(plane("a"))] }, 5000);
    expect(s.overview).toMatchObject({ fetchedAt: T, feedStatus: "ok", receivedAtMs: 5000 });
    expect(Object.keys(s.overview!.aircraft)).toEqual(["a"]);
  });

  it("keeps the last aircraft when only the status changes", () => {
    let s = applyOverview(initialLiveState, { fetchedAt: T, feedStatus: "ok", aircraft: [toOverviewCompact(plane("a"))] }, 5000);
    s = applyOverview(s, { fetchedAt: T, feedStatus: "degraded", aircraft: [toOverviewCompact(plane("a"))] }, 9000);
    expect(s.overview).toMatchObject({ feedStatus: "degraded", receivedAtMs: 5000 });
  });
});

describe("buildOverviewFeatures", () => {
  const overview = (list: OverviewAircraft[]): NonNullable<LiveState["overview"]> => ({
    fetchedAt: T,
    feedStatus: "ok",
    receivedAtMs: 0,
    aircraft: Object.fromEntries(list.map((a) => [a.hex, a])),
  });

  it("skips aircraft drawn by the detailed live layer", () => {
    const fc = buildOverviewFeatures(overview([plane("a"), plane("b")]), new Set(["a"]), 0, THRESHOLDS.display);
    expect(fc.features.map((f) => f.properties.hex)).toEqual(["b"]);
  });

  it("uses the generic icon, or a dot without a track, coloured by shown altitude", () => {
    const fc = buildOverviewFeatures(overview([plane("a"), plane("b", { trackDeg: null, altGeomFt: 9000, altFt: 11000 })]), new Set(), 0, THRESHOLDS.display);
    expect(fc.features[0]!.properties).toMatchObject({ icon: "unknown", band: "high", rotation: 0, source: "overview" });
    expect(fc.features[1]!.properties).toMatchObject({ icon: "dot", band: "low" });
  });

  it("dead-reckons at most interpolateMaxSec past the fix", () => {
    // 250 kt north: 15 s = 1.0417 nm. Fix is 60 s old: still capped at 15 s.
    const fc = buildOverviewFeatures(overview([plane("a", { lastPosTs: T - 60 })]), new Set(), 0, THRESHOLDS.display);
    const [, lat] = fc.features[0]!.geometry.coordinates;
    expect(lat).toBeCloseTo(-22 + (250 * 15) / 3600 / 60, 6);
  });
});

describe("coverageCircle", () => {
  it("draws a closed ring at the given radius", () => {
    const ring = coverageCircle({ lat: -33.9, lon: 151.0 }, 60, 64).geometry.coordinates[0]!;
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    // Due north point: 60 nm = 1° of latitude.
    expect(ring[0]![1]).toBeCloseTo(-32.9, 3);
    expect(ring[0]![0]).toBeCloseTo(151.0, 6);
  });
});

describe("overviewBadge", () => {
  it("is hidden when the overview is off", () => {
    expect(overviewBadge(null, 0)).toBeNull();
  });

  it("says how old the Australia-wide data is", () => {
    expect(overviewBadge({ fetchedAt: T, feedStatus: "ok", receivedAtMs: 1000, aircraft: {} }, 41_000)).toEqual({
      tone: "live",
      text: "Australia-wide · updated 40s ago",
    });
    expect(overviewBadge({ fetchedAt: T, feedStatus: "ok", receivedAtMs: 0, aircraft: {} }, 130_000)?.text).toBe(
      "Australia-wide · updated 2 min ago",
    );
  });

  it("goes amber when degraded and says when it's unavailable", () => {
    expect(overviewBadge({ fetchedAt: T, feedStatus: "degraded", receivedAtMs: 0, aircraft: {} }, 1000)?.tone).toBe("stale");
    expect(overviewBadge({ fetchedAt: T, feedStatus: "down", receivedAtMs: 0, aircraft: {} }, 1000)).toEqual({
      tone: "down",
      text: "Australia-wide data unavailable · showing the last update",
    });
    expect(overviewBadge({ fetchedAt: null, feedStatus: "degraded", receivedAtMs: 0, aircraft: {} }, 1000)).toEqual({
      tone: "pending",
      text: "Australia-wide · waiting for the first update",
    });
  });
});
