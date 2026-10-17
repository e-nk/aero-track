// Integration cases from docs/SPEC.md section 15 (P0 detectors).
import { describe, expect, it } from "vitest";
import { runAll } from "../src";
import { ctxFor, fly, withPoint } from "./fixtures/build";

const types = (r: ReturnType<typeof runAll>) => r.detections.map((d) => d.type);

describe("runAll", () => {
  it("steady level cruise → no events", () => {
    const track = fly([{ sec: 300 }]);
    const r = runAll(track, ctxFor(track));
    expect(r.status).toBe("ok");
    expect(r.detections).toEqual([]);
  });

  it("clean climb 3,000 ft over 3 min → climb", () => {
    const track = fly([{ sec: 180, climbFpm: 1000 }]);
    expect(types(runAll(track, ctxFor(track)))).toEqual(["climb"]);
  });

  it("±200 ft wobble → no climb or descent", () => {
    const track = fly([{ sec: 300 }]).map((o, i) => ({ ...o, altFt: 10000 + (i % 2 ? -200 : 200) }));
    expect(types(runAll(track, ctxFor(track)))).toEqual([]);
  });

  it("heading 350° → 10° → 30° → turn of 40°", () => {
    const track = fly([{ sec: 42 + 42 }]).map((o, i, all) => {
      const tail = [350, 10, 30];
      const k = i - (all.length - tail.length);
      return { ...o, trackDeg: k >= 0 ? tail[k]! : 350 };
    });
    const r = runAll(track, ctxFor(track));
    expect(types(r)).toEqual(["turn"]);
    expect(r.detections[0]!.evidence.totalDeg).toBe(40);
  });

  it("duplicates and out-of-order timestamps → same result as clean input", () => {
    const track = fly([{ sec: 60 }, { sec: 180, climbFpm: 1200 }, { sec: 28, turnDegPerSec: 3 }]);
    const messy = [...track].reverse();
    messy.splice(4, 0, { ...track[10]! }, { ...track[20]! });
    expect(runAll(messy, ctxFor(track))).toEqual(runAll(track, ctxFor(track)));
  });

  it("single +8,000 ft spike that reverts → glitch, no climb", () => {
    const track = fly([{ sec: 300 }]);
    const spiked = withPoint(track, 20, { altFt: 18000 });
    expect(types(runAll(spiked, ctxFor(spiked)))).toEqual(["glitch"]);
  });

  it("3-minute gap mid-track → gap; detectors use only the latest segment", () => {
    const before = fly([{ sec: 180, climbFpm: 1000 }]);
    // Short level segment after the gap: across the whole track the climb would
    // still qualify, so this fails if detectors look past the latest segment.
    const after = fly([{ sec: 63 }], { t: before.at(-1)!.t + 180, altFt: before.at(-1)!.altFt! });
    const track = [...before, ...after];
    expect(types(runAll(track, ctxFor(track)))).toEqual(["gap"]);
  });

  it("only 2 points → insufficient history, no behaviour events", () => {
    const track = fly([{ sec: 7, climbFpm: 3000 }]);
    const r = runAll(track, ctxFor(track));
    expect(r.status).toBe("insufficient_history");
    expect(r.detections).toEqual([]);
  });

  it("now − lastPosTs = 180 → signal_lost", () => {
    const track = fly([{ sec: 120 }]);
    const r = runAll(track, ctxFor(track, { now: track.at(-1)!.t + 180 }));
    expect(types(r)).toEqual(["signal_lost"]);
    expect(r.detections[0]!.evidence.secondsSinceLastPosition).toBe(180);
  });

  it("still reports facts when history is insufficient", () => {
    const track = fly([{ sec: 14 }]);
    const r = runAll(track, ctxFor(track, { now: track.at(-1)!.t + 120 }));
    expect(r.status).toBe("insufficient_history");
    expect(types(r)).toEqual(["signal_lost"]);
  });

  it("reports a take-off even before there is a minute of history", () => {
    const track = fly([{ sec: 14, onGround: true }, { sec: 21, climbFpm: 2000 }], {
      lat: -33.946098,
      lon: 151.177002,
      altFt: 0,
      onGround: true,
      gsKt: 150,
    });
    const r = runAll(track, ctxFor(track));
    expect(r.status).toBe("insufficient_history");
    expect(types(r)).toEqual(["takeoff"]);
  });

  it("400° cumulative turn at steady altitude in 5 min → circling with 1 lap, no separate turn", () => {
    const track = fly([{ sec: 56 }, { sec: 301, turnDegPerSec: 400 / 301 }]);
    const r = runAll(track, ctxFor(track));
    expect(types(r)).toEqual(["circling"]);
    expect(r.detections[0]!.evidence.laps).toBe(1);
  });

  it("sustained -6,000 fpm for 40 s → rapid_descent (too short to count as a sustained descent)", () => {
    const track = fly([{ sec: 70 }, { sec: 42, climbFpm: -6000 }], { altFt: 20000 });
    expect(types(runAll(track, ctxFor(track)))).toEqual(["rapid_descent"]);
  });

  it("a single +8,000 ft spike that reverts is a glitch, never a rapid descent", () => {
    const track = fly([{ sec: 300 }]);
    const spiked = withPoint(track, 20, { altFt: 18000, baroRateFpm: null });
    expect(types(runAll(spiked, ctxFor(spiked)))).not.toContain("rapid_descent");
  });

  it("squawk 7700 → emergency, even before a minute of history", () => {
    const track = fly([{ sec: 14 }]);
    const r = runAll(track, ctxFor(track, { squawk: "7700" }));
    expect(r.status).toBe("insufficient_history");
    expect(types(r)).toEqual(["emergency"]);
  });

  it("stops reporting behaviour once the signal is lost, so old movement isn't shown as current", () => {
    const track = fly([{ sec: 180, climbFpm: 1000 }]);
    const lost = runAll(track, ctxFor(track, { now: track.at(-1)!.t + 120 }));
    expect(types(lost)).toEqual(["signal_lost"]);
  });
});

