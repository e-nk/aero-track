import { THRESHOLDS, fromCompact, type CompactAircraft } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { buildAircraftFeatures } from "../lib/aircraftFeatures";
import type { LiveAircraft } from "../lib/liveState";

const NOW = 1_792_200_000;

const live = (c: Partial<Record<number, unknown>>, receivedAtMs = 0, serverNow = NOW): LiveAircraft => {
  const base: CompactAircraft = ["7c0001", "QFA1", -33.9, 151.0, 10000, 250, 0, 0, "B738", "A3", NOW, false, false];
  for (const [i, v] of Object.entries(c)) (base as unknown[])[Number(i)] = v;
  return { ...fromCompact(base), receivedAtMs, serverNow };
};

const build = (list: LiveAircraft[], nowMs: number) => buildAircraftFeatures(list, nowMs, THRESHOLDS.display);

describe("buildAircraftFeatures", () => {
  it("makes one point per aircraft with display properties", () => {
    const fc = build([live({})], 0);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toEqual({
      hex: "7c0001",
      callsign: "QFA1",
      icon: "narrowbody",
      band: "mid",
      rotation: 0,
      stale: false,
      hasEvent: false,
    });
  });

  it("dead-reckons from the fix using position age at the server plus local time since receipt", () => {
    // Fix is 2 s old at the server; 12.4 s have passed locally → 14.4 s at 250 kt = 1 nm north.
    const fc = build([live({ 10: NOW - 2 }, 1000)], 13400);
    const [lon, lat] = fc.features[0]!.geometry.coordinates;
    expect(lat).toBeCloseTo(-33.9 + 1 / 60, 6);
    expect(lon).toBeCloseTo(151.0, 9);
  });

  it("uses a non-directional icon when the track is unknown", () => {
    const fc = build([live({ 6: null })], 0);
    expect(fc.features[0]!.properties).toMatchObject({ icon: "dot", rotation: 0 });
  });

  it("marks aircraft stale after staleAfterSec without a new position", () => {
    const fresh = build([live({ 10: NOW - THRESHOLDS.display.staleAfterSec })], 0);
    const old = build([live({ 10: NOW - THRESHOLDS.display.staleAfterSec - 1 })], 0);
    expect(fresh.features[0]!.properties.stale).toBe(false);
    expect(old.features[0]!.properties.stale).toBe(true);
  });

  it("carries the open-event flag and ground band", () => {
    const fc = build([live({ 11: true, 12: true, 4: 0 })], 0);
    expect(fc.features[0]!.properties).toMatchObject({ hasEvent: true, band: "ground" });
  });
});
