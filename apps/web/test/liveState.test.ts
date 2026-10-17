import type { BehaviourEvent, CompactAircraft } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { applyEventClose, applyEventUpsert, applySnapshot, applyStatus, initialLiveState } from "../lib/liveState";

const NOW = 1_792_200_000;
const compact = (hex: string, patch: Partial<Record<number, unknown>> = {}): CompactAircraft => {
  const base: CompactAircraft = [hex, "QFA1", -33.9, 151.0, 10000, 250, 90, 0, "B738", "A3", NOW - 2, false, false, null];
  for (const [i, v] of Object.entries(patch)) (base as unknown[])[Number(i)] = v;
  return base;
};

const event = (id: string, hex = "7c0001"): BehaviourEvent => ({
  id,
  hex,
  type: "climb",
  confidence: "observed",
  windowStart: NOW - 60,
  windowEnd: NOW,
  evidence: {},
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: NOW,
  updatedAt: NOW,
  closedAt: null,
});

describe("live state", () => {
  it("applySnapshot replaces the aircraft set and records timing", () => {
    let s = applySnapshot(initialLiveState, { now: NOW, mode: "live", feedStatus: "ok", aircraft: [compact("a"), compact("b")] }, 5000);
    expect(Object.keys(s.aircraft).sort()).toEqual(["a", "b"]);
    expect(s.aircraft.a).toMatchObject({ hex: "a", callsign: "QFA1", receivedAtMs: 5000, serverNow: NOW });
    expect(s).toMatchObject({ feedStatus: "ok", serverNow: NOW, lastSnapshotAt: 5000 });

    s = applySnapshot(s, { now: NOW + 7, mode: "live", feedStatus: "ok", aircraft: [compact("b")] }, 12000);
    expect(Object.keys(s.aircraft)).toEqual(["b"]);
  });

  it("ignores a snapshot that isn't live data, so modes never mix", () => {
    const s = applySnapshot(initialLiveState, { now: NOW, mode: "recorded", feedStatus: "ok", aircraft: [compact("a")] }, 1);
    expect(s).toBe(initialLiveState);
  });

  it("applyStatus records feed health", () => {
    expect(applyStatus(initialLiveState, { feedStatus: "down", lastPollAt: 123 })).toMatchObject({
      feedStatus: "down",
      lastPollAt: 123,
    });
  });

  it("event open and update upsert; close removes", () => {
    let s = applyEventUpsert(initialLiveState, event("e1"));
    s = applyEventUpsert(s, { ...event("e1"), evidence: { netFt: 1 } });
    s = applyEventUpsert(s, event("e2", "7c0002"));
    expect(Object.keys(s.events).sort()).toEqual(["e1", "e2"]);
    expect(s.events.e1!.evidence).toEqual({ netFt: 1 });
    s = applyEventClose(s, { id: "e1", hex: "7c0001", closedAt: NOW });
    expect(Object.keys(s.events)).toEqual(["e2"]);
  });

  it("ignores events that aren't live", () => {
    expect(applyEventUpsert(initialLiveState, { ...event("e1"), mode: "fixture" })).toBe(initialLiveState);
  });
});
