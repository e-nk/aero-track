import { describe, expect, it } from "vitest";
import { detectCircling } from "../src/circling";
import { ctxFor, fly } from "./fixtures/build";

const run = (track: ReturnType<typeof fly>) => detectCircling(track, ctxFor(track));

describe("detectCircling", () => {
  it("400° of turning at steady altitude in 5 minutes → possible circling, 1 lap", () => {
    const d = run(fly([{ sec: 56 }, { sec: 301, turnDegPerSec: 400 / 301 }]));
    expect(d).toMatchObject({ type: "circling", confidence: "possible", evidence: { laps: 1, direction: "right", altSpreadFt: 0 } });
    expect(Number(d!.evidence.totalDeg)).toBeCloseTo(400, -1);
    expect(Number(d!.evidence.spanSec)).toBeLessThanOrEqual(360);
  });

  it("reports left-hand circling with a negative total", () => {
    const d = run(fly([{ sec: 301, turnDegPerSec: -1.4 }]));
    expect(d!.evidence.direction).toBe("left");
    expect(Number(d!.evidence.totalDeg)).toBeLessThan(-300);
  });

  it("measures how far the altitude wandered", () => {
    const d = run(fly([{ sec: 301, turnDegPerSec: 1.4, climbFpm: 60 }]));
    expect(Number(d!.evidence.altSpreadFt)).toBeGreaterThan(250);
  });

  it("is not circling after a single ordinary turn", () => {
    expect(run(fly([{ sec: 200 }, { sec: 63, turnDegPerSec: 2 }]))).toBeNull();
  });

  it("needs most turning in one direction (not back-and-forth weaving)", () => {
    // Big swings both ways: lots of degrees, little net rotation.
    const weave = fly([{ sec: 350 }]).map((o, i) => ({ ...o, trackDeg: i % 2 ? 60 : 120 }));
    expect(run(weave)).toBeNull();
  });

  it("needs the share of same-direction steps even when the net rotation is large", () => {
    // Zigzag: +45° then -15° each pair of reports. Net +750° but only half the steps turn right.
    let heading = 0;
    const zigzag = fly([{ sec: 350 }]).map((o, i) => {
      if (i > 0) heading = (heading + (i % 2 ? 45 : -15) + 360) % 360;
      return { ...o, trackDeg: heading };
    });
    expect(run(zigzag)).toBeNull();
  });

  it("only looks at the last windowSec", () => {
    expect(run(fly([{ sec: 301, turnDegPerSec: 1.4 }, { sec: 420 }]))).toBeNull();
  });

  it("ignores on-ground points", () => {
    const track = fly([{ sec: 350, onGround: true, turnDegPerSec: 1.4 }], { onGround: true, altFt: 0, gsKt: 15 });
    expect(run(track)).toBeNull();
  });
});
