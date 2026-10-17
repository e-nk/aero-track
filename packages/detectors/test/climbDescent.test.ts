import { describe, expect, it } from "vitest";
import { detectClimbDescent } from "../src/climbDescent";
import { ctxFor, fly } from "./fixtures/build";

const run = (track: ReturnType<typeof fly>) => detectClimbDescent(track, ctxFor(track));

describe("detectClimbDescent", () => {
  it("detects a clean climb of 3,000 ft over 3 minutes", () => {
    const track = fly([{ sec: 180, climbFpm: 1000 }], { altFt: 5000 });
    const d = run(track);
    expect(d).toMatchObject({ type: "climb", confidence: "observed" });
    expect(d!.evidence.startAltFt).toBe(5000);
    expect(d!.evidence.endAltFt).toBe(8025);
    expect(d!.evidence.netFt).toBe(3025);
    expect(d!.evidence.spanSec).toBe(182);
    expect(d!.evidence.avgRateFpm).toBe(997);
    expect(d!.evidence.obs).toBe(track.length);
    expect(d!.windowStart).toBe(track[0]!.t);
    expect(d!.windowEnd).toBe(track.at(-1)!.t);
  });

  it("detects a descent with negative netFt", () => {
    const d = run(fly([{ sec: 180, climbFpm: -1000 }], { altFt: 9000 }));
    expect(d).toMatchObject({ type: "descent", confidence: "observed" });
    expect(d!.evidence.netFt).toBe(-3025);
  });

  it("ignores level flight", () => {
    expect(run(fly([{ sec: 300 }]))).toBeNull();
  });

  it("ignores a ±200 ft wobble", () => {
    const track = fly([{ sec: 300 }]).map((o, i) => ({
      ...o,
      altFt: 10000 + (i % 2 === 0 ? 200 : -200),
      baroRateFpm: i % 2 === 0 ? 400 : -400,
    }));
    expect(run(track)).toBeNull();
  });

  it("does not report a climb that ended long ago", () => {
    expect(run(fly([{ sec: 180, climbFpm: 1000 }, { sec: 600 }]))).toBeNull();
  });

  it("ignores on-ground points", () => {
    const track = fly([{ sec: 60, onGround: true }, { sec: 120, climbFpm: 1000 }], {
      altFt: 0,
      onGround: true,
    });
    const d = run(track);
    expect(d?.type).toBe("climb");
    const firstAirborne = track.find((o) => !o.onGround)!;
    expect(d!.evidence.startAltFt).toBe(firstAirborne.altFt);
    expect(d!.windowStart).toBe(firstAirborne.t);
  });

  it("needs the net change to reach minNetFt (trigger A)", () => {
    // 450 fpm for 2 min = 900 ft, and the rate is under the trigger B threshold.
    expect(run(fly([{ sec: 120, climbFpm: 450 }]))).toBeNull();
  });

  it("detects sustained vertical rate below minNetFt (trigger B)", () => {
    // -600 fpm for 77 s = about 770 ft.
    const d = run(fly([{ sec: 77, climbFpm: -600 }]));
    expect(d?.type).toBe("descent");
  });

  it("uses vertical rate when altitude is unknown (trigger B)", () => {
    const track = fly([{ sec: 77, climbFpm: 800 }]).map((o) => ({ ...o, altFt: null }));
    const d = run(track);
    expect(d?.type).toBe("climb");
    expect(d!.evidence.avgRateFpm).toBe(800);
  });

  it("does not trigger B when the sustained rate spans under minSpanSec", () => {
    const track = fly([{ sec: 120 }, { sec: 42, climbFpm: 900 }]);
    expect(run(track)).toBeNull();
  });
});
