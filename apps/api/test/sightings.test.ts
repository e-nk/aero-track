import { THRESHOLDS, type BehaviourEvent } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { SightingTracker, type Sighting } from "../src/sightings";
import { T0 } from "./helpers";

const KEEP = THRESHOLDS.buffer.keepSec;

function make(seed: Sighting[] = []) {
  let n = 0;
  return new SightingTracker({ keepSec: KEEP, newId: () => `s-${++n}`, seed });
}

const event = (type: "takeoff" | "landing", at: number, airport?: string): BehaviourEvent => ({
  id: `${type}-${at}`,
  hex: "7c0001",
  type,
  confidence: "observed",
  windowStart: at,
  windowEnd: at + 21,
  evidence: airport ? { at, airport } : { at },
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: at + 21,
  updatedAt: at + 21,
  closedAt: null,
});

describe("SightingTracker", () => {
  it("opens a sighting the first time an aircraft is seen, then extends it", () => {
    const t = make();
    expect(t.touch("7c0001", T0)).toEqual({
      id: "s-1",
      hex: "7c0001",
      startedAt: T0,
      lastSeenAt: T0,
      tookOffAt: null,
      takeoffAirport: null,
      landedAt: null,
      landingAirport: null,
    });
    expect(t.touch("7c0001", T0 + 7)).toMatchObject({ id: "s-1", startedAt: T0, lastSeenAt: T0 + 7 });
  });

  it("starts a new sighting after more than keepSec without a position", () => {
    const t = make();
    t.touch("7c0001", T0);
    expect(t.touch("7c0001", T0 + KEEP).id).toBe("s-1");
    expect(t.touch("7c0001", T0 + 2 * KEEP + 1)).toMatchObject({ id: "s-2", startedAt: T0 + 2 * KEEP + 1 });
  });

  it("records take-off and landing on the current sighting", () => {
    const t = make();
    t.touch("7c0001", T0);
    expect(t.applyEvent(event("takeoff", T0 + 30, "YSSY"))).toMatchObject({ id: "s-1", tookOffAt: T0 + 30, takeoffAirport: "YSSY" });
    expect(t.applyEvent(event("landing", T0 + 3000, "YSBK"))).toMatchObject({ id: "s-1", landedAt: T0 + 3000, landingAirport: "YSBK" });
  });

  it("a take-off after a landing starts a new sighting", () => {
    const t = make();
    t.touch("7c0001", T0);
    t.applyEvent(event("landing", T0 + 60, "YSSY"));
    const next = t.applyEvent(event("takeoff", T0 + 600, "YSSY"));
    expect(next).toMatchObject({ id: "s-2", startedAt: T0 + 600, tookOffAt: T0 + 600, landedAt: null });
    expect(t.touch("7c0001", T0 + 607).id).toBe("s-2");
  });

  it("ignores repeats of the same take-off (event updates)", () => {
    const t = make();
    t.touch("7c0001", T0);
    t.applyEvent(event("takeoff", T0 + 30));
    expect(t.applyEvent(event("takeoff", T0 + 30))).toBeNull();
  });

  it("ignores events for an aircraft without a sighting, and other event types", () => {
    const t = make();
    expect(t.applyEvent(event("takeoff", T0))).toBeNull();
    t.touch("7c0001", T0);
    expect(t.applyEvent({ ...event("takeoff", T0), type: "climb" })).toBeNull();
  });

  it("continues sightings that were open before a restart", () => {
    const t = make([
      { id: "old", hex: "7c0001", startedAt: T0, lastSeenAt: T0 + 60, tookOffAt: null, takeoffAirport: null, landedAt: null, landingAirport: null },
    ]);
    expect(t.touch("7c0001", T0 + 120).id).toBe("old");
    expect(t.current("7c0001")?.id).toBe("old");
  });

  it("forgets sightings older than keepSec", () => {
    const t = make();
    t.touch("7c0001", T0);
    t.prune(T0 + KEEP + 1);
    expect(t.current("7c0001")).toBeUndefined();
  });
});
