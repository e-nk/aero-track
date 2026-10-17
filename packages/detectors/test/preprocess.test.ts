import { THRESHOLDS } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { preprocess } from "../src/preprocess";
import { T0, fly, withPoint } from "./fixtures/build";

const level = (sec = 180) => fly([{ sec }]);

describe("preprocess: ordering and hygiene", () => {
  it("sorts by time", () => {
    const track = level();
    const shuffled = [...track].reverse();
    const out = preprocess(shuffled, THRESHOLDS);
    expect(out.points.map((o) => o.t)).toEqual(track.map((o) => o.t));
  });

  it("keeps the last-received point when timestamps repeat", () => {
    const track = level();
    const dup = { ...track[5]!, altFt: 10025 };
    const out = preprocess([...track, dup], THRESHOLDS);
    expect(out.points).toHaveLength(track.length);
    expect(out.points.find((o) => o.t === dup.t)?.altFt).toBe(10025);
  });

  it("drops points without a usable position", () => {
    const track = withPoint(level(), 3, { lat: Number.NaN });
    const out = preprocess(track, THRESHOLDS);
    expect(out.points).toHaveLength(track.length - 1);
  });

  it("drops a position jump faster than maxImpliedGsKt", () => {
    // 1 degree of latitude (60 nm) in 7 s is about 30,000 kt.
    const track = level();
    const jumped = withPoint(track, 6, { lat: track[6]!.lat + 1 });
    const out = preprocess(jumped, THRESHOLDS);
    expect(out.points).toHaveLength(track.length - 1);
    expect(out.points.some((o) => o.t === track[6]!.t)).toBe(false);
  });
});

describe("preprocess: glitches", () => {
  it("marks a single +8,000 ft spike that reverts next sample", () => {
    const track = level();
    const spiked = withPoint(track, 10, { altFt: 18000 });
    const out = preprocess(spiked, THRESHOLDS);

    expect(out.points.some((o) => o.altFt === 18000)).toBe(false);
    expect(out.glitch).toMatchObject({
      type: "glitch",
      confidence: "fact",
      evidence: { glitchAltFt: 18000, expectedAltFt: 10000, at: track[10]!.t },
    });
    expect(Number(out.glitch!.evidence.impliedRateFpm)).toBeGreaterThan(THRESHOLDS.glitch.spikeRateFpm);
  });

  it("does not mark a step that never reverts", () => {
    const track = level().map((o, i) => (i >= 10 ? { ...o, altFt: 13000 } : o));
    const out = preprocess(track, THRESHOLDS);
    expect(out.glitch).toBeNull();
  });

  it("ignores points with unknown altitude when looking for spikes", () => {
    const track = withPoint(level(), 10, { altFt: null });
    const out = preprocess(track, THRESHOLDS);
    expect(out.glitch).toBeNull();
    expect(out.points).toHaveLength(track.length);
  });
});

describe("preprocess: gaps and history", () => {
  it("splits on a 3-minute gap and reports it", () => {
    const before = fly([{ sec: 120 }]);
    const after = fly([{ sec: 120 }], { t: before.at(-1)!.t + 180 });
    const out = preprocess([...before, ...after], THRESHOLDS);

    expect(out.segments).toHaveLength(2);
    expect(out.latest.map((o) => o.t)).toEqual(after.map((o) => o.t));
    expect(out.gap).toMatchObject({
      type: "gap",
      confidence: "fact",
      evidence: { gapStart: before.at(-1)!.t, gapEnd: after[0]!.t, gapSec: 180 },
    });
  });

  it("does not split at exactly the gap threshold", () => {
    const before = fly([{ sec: 70 }]);
    const after = fly([{ sec: 70 }], { t: before.at(-1)!.t + THRESHOLDS.gap.thresholdSec });
    const out = preprocess([...before, ...after], THRESHOLDS);
    expect(out.segments).toHaveLength(1);
    expect(out.gap).toBeNull();
  });

  it("reports insufficient history with only 2 points", () => {
    const out = preprocess(fly([{ sec: 7 }]), THRESHOLDS);
    expect(out.status).toBe("insufficient_history");
  });

  it("reports insufficient history when the latest segment spans under a minute", () => {
    const out = preprocess(fly([{ sec: 49 }]), THRESHOLDS);
    expect(out.points.length).toBeGreaterThanOrEqual(THRESHOLDS.hygiene.minPoints);
    expect(out.status).toBe("insufficient_history");
  });

  it("is ok with enough history", () => {
    expect(preprocess(fly([{ sec: 70 }]), THRESHOLDS).status).toBe("ok");
  });

  it("handles an empty track", () => {
    const out = preprocess([], THRESHOLDS);
    expect(out.status).toBe("insufficient_history");
    expect(out.points).toEqual([]);
    expect(out.latest).toEqual([]);
  });

  it("uses T0 as a real epoch", () => {
    expect(level()[0]!.t).toBe(T0);
  });
});
