import type { BehaviourEvent, EventType, Observation } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { EVENT_TITLE, eventTitle } from "../lib/eventCopy";
import { applyEventsSeed, initialLiveState, openEventsFor } from "../lib/liveState";
import { trackFeature } from "../lib/trackFeature";

const NOW = 1_792_200_000;
const event = (id: string, hex: string, openedAt: number, patch: Partial<BehaviourEvent> = {}): BehaviourEvent => ({
  id,
  hex,
  type: "climb",
  confidence: "observed",
  windowStart: openedAt,
  windowEnd: openedAt,
  evidence: {},
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt,
  updatedAt: openedAt,
  closedAt: null,
  ...patch,
});

const obs = (t: number, lon: number, lat: number): Observation => ({
  t,
  lat,
  lon,
  altFt: 1000,
  onGround: false,
  gsKt: 200,
  trackDeg: 90,
  baroRateFpm: 0,
});

describe("event titles", () => {
  it("has a plain title for every event type", () => {
    const types: EventType[] = ["climb", "descent", "turn", "circling", "rapid_descent", "signal_lost", "glitch", "gap", "emergency"];
    for (const t of types) expect(EVENT_TITLE[t]).toMatch(/\w/);
    expect(eventTitle("circling")).toBe("Possibly circling");
  });
});

describe("seeding and listing events", () => {
  it("replaces one aircraft's open events and keeps others", () => {
    let s = applyEventsSeed(initialLiveState, "a", [event("a1", "a", NOW)]);
    s = applyEventsSeed(s, "b", [event("b1", "b", NOW)]);
    s = applyEventsSeed(s, "a", [event("a2", "a", NOW + 7)]);
    expect(Object.keys(s.events).sort()).toEqual(["a2", "b1"]);
  });

  it("ignores closed and non-live events when seeding", () => {
    const s = applyEventsSeed(initialLiveState, "a", [
      event("a1", "a", NOW, { status: "closed" }),
      event("a2", "a", NOW, { mode: "recorded" }),
    ]);
    expect(s.events).toEqual({});
  });

  it("lists an aircraft's open events newest first", () => {
    const s = applyEventsSeed(initialLiveState, "a", [event("old", "a", NOW), event("new", "a", NOW + 60)]);
    expect(openEventsFor(s.events, "a").map((e) => e.id)).toEqual(["new", "old"]);
    expect(openEventsFor(s.events, "b")).toEqual([]);
  });
});

describe("trackFeature", () => {
  it("draws one line per segment so gaps stay gaps", () => {
    const f = trackFeature([
      [obs(1, 151, -33.9), obs(2, 151.01, -33.9)],
      [obs(200, 151.1, -33.9), obs(207, 151.11, -33.9), obs(214, 151.12, -33.9)],
    ]);
    expect(f?.geometry).toEqual({
      type: "MultiLineString",
      coordinates: [
        [[151, -33.9], [151.01, -33.9]],
        [[151.1, -33.9], [151.11, -33.9], [151.12, -33.9]],
      ],
    });
  });

  it("skips single-point segments, which can't form a line", () => {
    const f = trackFeature([[obs(1, 151, -33.9)], [obs(200, 151.1, -33.9), obs(207, 151.11, -33.9)]]);
    expect(f?.geometry.coordinates).toHaveLength(1);
  });

  it("returns null when there is nothing to draw", () => {
    expect(trackFeature([])).toBeNull();
    expect(trackFeature([[obs(1, 151, -33.9)]])).toBeNull();
  });
});
