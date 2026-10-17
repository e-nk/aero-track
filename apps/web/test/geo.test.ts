import { describe, expect, it } from "vitest";
import { altitudeBand, deadReckon } from "../lib/geo";

describe("altitudeBand", () => {
  const bands = [10000, 25000] as const;
  it.each([
    [{ altFt: 0, onGround: true }, "ground"],
    [{ altFt: null, onGround: false }, "unknown"],
    [{ altFt: -325, onGround: false }, "low"],
    [{ altFt: 9999, onGround: false }, "low"],
    [{ altFt: 10000, onGround: false }, "mid"],
    [{ altFt: 24999, onGround: false }, "mid"],
    [{ altFt: 25000, onGround: false }, "high"],
  ] as const)("%o → %s", (a, band) => {
    expect(altitudeBand(a.altFt, a.onGround, bands)).toBe(band);
  });
});

describe("deadReckon", () => {
  const fix = { lat: -33.9, lon: 151.0, gsKt: 250, trackDeg: 0, onGround: false };

  it("moves along the track at ground speed", () => {
    // 250 kt for 14.4 s = 1 nm = 1/60° of latitude.
    const p = deadReckon(fix, 14.4, 15);
    expect(p.lat).toBeCloseTo(-33.9 + 1 / 60, 6);
    expect(p.lon).toBeCloseTo(151.0, 9);
  });

  it("accounts for longitude shrinking away from the equator", () => {
    const p = deadReckon({ ...fix, trackDeg: 90 }, 14.4, 15);
    expect(p.lon - 151.0).toBeCloseTo(1 / 60 / Math.cos((-33.9 * Math.PI) / 180), 5);
    expect(p.lat).toBeCloseTo(-33.9, 5);
  });

  it("stops at the cap", () => {
    expect(deadReckon(fix, 60, 15)).toEqual(deadReckon(fix, 15, 15));
  });

  it("never moves backwards in time", () => {
    expect(deadReckon(fix, -5, 15)).toEqual({ lat: fix.lat, lon: fix.lon });
  });

  it("does not move without speed or track, or on the ground", () => {
    const still = { lat: fix.lat, lon: fix.lon };
    expect(deadReckon({ ...fix, gsKt: null }, 10, 15)).toEqual(still);
    expect(deadReckon({ ...fix, trackDeg: null }, 10, 15)).toEqual(still);
    expect(deadReckon({ ...fix, onGround: true }, 10, 15)).toEqual(still);
  });
});
