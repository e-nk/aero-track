import { describe, expect, it } from "vitest";
import { detectSignalLost } from "../src/signalLost";
import { ctxFor, fly } from "./fixtures/build";

describe("detectSignalLost", () => {
  const track = fly([{ sec: 120 }], { altFt: 4500 });
  const last = track.at(-1)!;

  it("fires when the last position is 180 s old", () => {
    const d = detectSignalLost(track, ctxFor(track, { now: last.t + 180 }));
    expect(d).toMatchObject({
      type: "signal_lost",
      confidence: "fact",
      windowStart: last.t,
      windowEnd: last.t + 180,
      evidence: {
        secondsSinceLastPosition: 180,
        lastAltFt: 4500,
        lastLat: last.lat,
        lastLon: last.lon,
      },
    });
  });

  it("does not fire at exactly afterSec", () => {
    expect(detectSignalLost(track, ctxFor(track, { now: last.t + 60 }))).toBeNull();
  });

  it("uses ctx.lastPosTs, not the newest track point", () => {
    const d = detectSignalLost(track, ctxFor(track, { lastPosTs: last.t - 100, now: last.t }));
    expect(d?.evidence.secondsSinceLastPosition).toBe(100);
  });

  it("omits last-position evidence when the track is empty", () => {
    const d = detectSignalLost([], ctxFor([], { lastPosTs: 1000, now: 1200 }));
    expect(d?.evidence).toEqual({ secondsSinceLastPosition: 200 });
  });

  it("adds vertical state and the nearest airport when close to one", () => {
    const approach = fly([{ sec: 63, climbFpm: -800 }], { lat: -33.946, lon: 151.0, altFt: 2000 });
    const end = approach.at(-1)!;
    const d = detectSignalLost(approach, ctxFor(approach, { now: end.t + 120 }));
    expect(d!.evidence).toMatchObject({ lastVertical: "descending", nearAirport: "YSSY" });
    expect(Number(d!.evidence.nearAirportKm)).toBeGreaterThan(5);
    expect(Number(d!.evidence.nearAirportKm)).toBeLessThan(10);
  });

  it("leaves out the airport when none is within nearAirportKm", () => {
    const far = fly([{ sec: 63 }], { lat: -34.6, lon: 151.6 });
    const d = detectSignalLost(far, ctxFor(far, { now: far.at(-1)!.t + 120 }));
    expect(d!.evidence).toMatchObject({ lastVertical: "level" });
    expect(d!.evidence.nearAirport).toBeUndefined();
  });
});

