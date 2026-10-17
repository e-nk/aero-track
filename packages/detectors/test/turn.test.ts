import { describe, expect, it } from "vitest";
import { detectTurn } from "../src/turn";
import { ctxFor, fly } from "./fixtures/build";

const run = (track: ReturnType<typeof fly>) => detectTurn(track, ctxFor(track));

const withTracks = (tracks: number[]) =>
  fly([{ sec: 7 * (tracks.length - 1) }]).map((o, i) => ({ ...o, trackDeg: tracks[i]! }));

describe("detectTurn", () => {
  it("measures 350° → 10° → 30° as 40° right, not 320°", () => {
    const d = run(withTracks([350, 350, 350, 350, 350, 10, 30]));
    expect(d).toMatchObject({ type: "turn", confidence: "observed" });
    expect(d!.evidence.totalDeg).toBe(40);
    expect(d!.evidence.direction).toBe("right");
  });

  it("reports left turns as negative", () => {
    const d = run(withTracks([90, 90, 90, 70, 50, 30]));
    expect(d!.evidence.totalDeg).toBe(-60);
    expect(d!.evidence.direction).toBe("left");
  });

  it("ignores small steps below ignoreStepBelowDeg", () => {
    expect(run(withTracks([90, 94, 98, 102, 106, 110, 114, 118, 122, 126]))).toBeNull();
  });

  it("ignores back-and-forth jitter", () => {
    expect(run(withTracks([90, 100, 90, 100, 90, 100, 90]))).toBeNull();
  });

  it("only looks at the last windowSec", () => {
    const track = fly([{ sec: 21, turnDegPerSec: 3 }, { sec: 120 }]);
    expect(run(track)).toBeNull();
  });

  it("detects a standard-rate turn from dead-reckoned data", () => {
    const d = run(fly([{ sec: 120 }, { sec: 21, turnDegPerSec: 3 }]));
    expect(d!.evidence.totalDeg).toBeCloseTo(63, 0);
    expect(d!.evidence.spanSec).toBeGreaterThan(0);
  });

  it("ignores on-ground points", () => {
    const track = fly([{ sec: 120, onGround: true }, { sec: 28, onGround: true, turnDegPerSec: 3 }], {
      altFt: 0,
      onGround: true,
    });
    expect(run(track)).toBeNull();
  });

  it("skips points with unknown track", () => {
    const track = withTracks([350, 350, 350, 350, 350, 10, 30]).map((o, i) =>
      i === 5 ? { ...o, trackDeg: null } : o,
    );
    expect(run(track)!.evidence.totalDeg).toBe(40);
  });
});
