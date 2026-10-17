import { describe, expect, it } from "vitest";
import { detectRapidDescent } from "../src/rapidDescent";
import { ctxFor, fly } from "./fixtures/build";

const run = (track: ReturnType<typeof fly>) => detectRapidDescent(track, ctxFor(track));

describe("detectRapidDescent", () => {
  it("sustained -6,000 fpm for 40 s → rapid descent", () => {
    const track = fly([{ sec: 70 }, { sec: 42, climbFpm: -6000 }], { altFt: 20000 });
    const d = run(track);
    expect(d).toMatchObject({ type: "rapid_descent", confidence: "observed", evidence: { peakRateFpm: -6000, avgRateFpm: -6000 } });
    expect(Number(d!.evidence.spanSec)).toBeGreaterThanOrEqual(30);
    expect(d!.evidence.startAltFt).toBe(20000);
    expect(Number(d!.evidence.endAltFt)).toBeLessThan(16000);
  });

  it("needs minConsecutiveObs points", () => {
    expect(run(fly([{ sec: 70 }, { sec: 14, climbFpm: -6000 }], { altFt: 20000 }))).toBeNull();
  });

  it("needs the descent to last minSpanSec", () => {
    // Three fast reports only 2 s apart: enough points, too short.
    const track = fly([{ sec: 70 }, { sec: 6, climbFpm: -6000 }], { altFt: 20000 }, 2);
    expect(run(track)).toBeNull();
  });

  it("ignores ordinary descents", () => {
    expect(run(fly([{ sec: 300, climbFpm: -2500 }], { altFt: 30000 }))).toBeNull();
  });

  it("works out the rate from altitude when vertical speed isn't reported", () => {
    const track = fly([{ sec: 70 }, { sec: 42, climbFpm: -6500 }], { altFt: 20000 }).map((o) => ({ ...o, baroRateFpm: null }));
    expect(run(track)?.type).toBe("rapid_descent");
  });

  it("ignores on-ground points", () => {
    const track = fly([{ sec: 70 }, { sec: 42, climbFpm: -6000 }], { altFt: 20000 }).map((o) => ({ ...o, onGround: true }));
    expect(run(track)).toBeNull();
  });
});
