import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS, type BehaviourEvent } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { AircraftStore } from "../src/buffer";
import { hydrate } from "../src/hydrate";
import { FakeRepo } from "./fakeRepo";
import { T0, obs, state } from "./helpers";

const NOW = T0 + 600;

function setup() {
  const repo = new FakeRepo();
  const store = new AircraftStore(THRESHOLDS);
  const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => "new" });
  return { repo, store, lifecycle, run: () => hydrate({ repo, store, lifecycle, nowSec: NOW, thresholds: THRESHOLDS }) };
}

const openEvent = (id: string, hex: string): BehaviourEvent => ({
  id,
  hex,
  type: "climb",
  confidence: "observed",
  windowStart: NOW - 60,
  windowEnd: NOW - 7,
  evidence: { netFt: 1200 },
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: NOW - 60,
  updatedAt: NOW - 7,
  closedAt: null,
});

describe("hydrate", () => {
  it("rebuilds the last keepSec of tracks and aircraft state from the database", async () => {
    const { repo, store, run } = setup();
    await repo.upsertAircraft([state("7c0001", obs(NOW - 7), { callsign: "QFA1", registration: "VH-OQA" })]);
    await repo.insertPositions([
      { hex: "7c0001", obs: obs(NOW - THRESHOLDS.buffer.keepSec - 1), squawk: "1000", callsign: null, mode: "live" },
      { hex: "7c0001", obs: obs(NOW - 14), squawk: "1000", callsign: null, mode: "live" },
      { hex: "7c0001", obs: obs(NOW - 7, { altFt: 11000 }), squawk: "1234", callsign: null, mode: "live" },
    ]);

    const summary = await run();

    expect(summary).toMatchObject({ aircraft: 1, positions: 2 });
    expect(store.track("7c0001").map((o) => o.t)).toEqual([NOW - 14, NOW - 7]);
    expect(store.get("7c0001")).toEqual({
      ...state("7c0001", obs(NOW - 7, { altFt: 11000 }), { callsign: "QFA1", registration: "VH-OQA" }),
      squawk: "1234",
      emergency: null, // not stored; refreshed by the next poll
    });
  });

  it("uses Not available identity when the aircraft row is missing", async () => {
    const { repo, store, run } = setup();
    await repo.insertPositions([{ hex: "7c0002", obs: obs(NOW - 7), squawk: null, callsign: null, mode: "live" }]);
    await run();
    expect(store.get("7c0002")).toMatchObject({ callsign: null, registration: null, typeCode: null, category: null });
  });

  it("continues open events for aircraft still in the buffer", async () => {
    const { repo, lifecycle, run } = setup();
    await repo.insertPositions([{ hex: "7c0001", obs: obs(NOW - 7), squawk: null, callsign: null, mode: "live" }]);
    await repo.upsertEvents([openEvent("e1", "7c0001")]);
    const summary = await run();
    expect(summary.restoredEvents).toBe(1);
    expect(lifecycle.openEvents().map((e) => e.id)).toEqual(["e1"]);
  });

  it("closes open events for aircraft that are no longer in the buffer", async () => {
    const { repo, lifecycle, run } = setup();
    await repo.upsertEvents([openEvent("e2", "7c0009")]);
    const summary = await run();
    expect(lifecycle.openEvents()).toEqual([]);
    expect(summary.closedEvents).toEqual([expect.objectContaining({ id: "e2", status: "closed", closedAt: NOW })]);
  });

  it("is a no-op on an empty database", async () => {
    const { store, run } = setup();
    expect(await run()).toEqual({ aircraft: 0, positions: 0, restoredEvents: 0, closedEvents: [] });
    expect(store.all()).toEqual([]);
  });
});
