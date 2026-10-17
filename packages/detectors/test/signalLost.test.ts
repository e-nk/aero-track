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
});
