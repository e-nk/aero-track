import { THRESHOLDS, type BehaviourEvent } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { FollowList } from "../src/follows";
import { T0 } from "./helpers";

const opts = { ...THRESHOLDS.follow, maxFollowed: 2 };

const landing = (hex: string, at: number): BehaviourEvent => ({
  id: `landing-${hex}`,
  hex,
  type: "landing",
  confidence: "observed",
  windowStart: at,
  windowEnd: at + 21,
  evidence: { at },
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: at + 21,
  updatedAt: at + 21,
  closedAt: null,
});

describe("FollowList", () => {
  it("adds, lists and removes followed aircraft", () => {
    const f = new FollowList(opts);
    expect(f.add("7C0001", T0)).toBe("added");
    expect(f.add("7c0001", T0 + 5)).toBe("exists");
    expect(f.list()).toEqual([{ hex: "7c0001", addedAt: T0, landedAt: null }]);
    expect(f.has("7c0001")).toBe(true);
    expect(f.remove("7c0001")).toBe(true);
    expect(f.remove("7c0001")).toBe(false);
    expect(f.list()).toEqual([]);
  });

  it("refuses more than maxFollowed", () => {
    const f = new FollowList(opts);
    f.add("7c0001", T0);
    f.add("7c0002", T0);
    expect(f.add("7c0003", T0)).toBe("full");
    expect(f.hexes()).toEqual(["7c0001", "7c0002"]);
  });

  it("rejects things that aren't ICAO addresses", () => {
    const f = new FollowList(opts);
    expect(f.add("hello", T0)).toBe("invalid");
    expect(f.add("~2a0b1c", T0)).toBe("added"); // non-ICAO (TIS-B) addresses are valid hex ids
  });

  it("notes an observed landing and stops following afterLandingSec later", () => {
    const f = new FollowList(opts);
    f.add("7c0001", T0);
    expect(f.applyEvents([landing("7c0001", T0 + 3600)])).toBe(true);
    expect(f.list()[0]!.landedAt).toBe(T0 + 3600);
    expect(f.expire(T0 + 3600 + opts.afterLandingSec)).toEqual([]);
    expect(f.expire(T0 + 3600 + opts.afterLandingSec + 1)).toEqual(["7c0001"]);
    expect(f.list()).toEqual([]);
  });

  it("ignores events for aircraft it isn't following, and repeats", () => {
    const f = new FollowList(opts);
    f.add("7c0001", T0);
    expect(f.applyEvents([landing("7c0009", T0)])).toBe(false);
    f.applyEvents([landing("7c0001", T0 + 60)]);
    expect(f.applyEvents([landing("7c0001", T0 + 60)])).toBe(false);
  });

  it("continues follows saved before a restart", () => {
    const f = new FollowList(opts, [{ hex: "7c0001", addedAt: T0, landedAt: null }]);
    expect(f.hexes()).toEqual(["7c0001"]);
    expect(f.add("7c0001", T0 + 5)).toBe("exists");
  });

  it("never follows longer than maxAgeSec", () => {
    const f = new FollowList(opts);
    f.add("7c0001", T0);
    expect(f.expire(T0 + opts.maxAgeSec)).toEqual([]);
    expect(f.expire(T0 + opts.maxAgeSec + 1)).toEqual(["7c0001"]);
  });
});
