import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { AircraftStore } from "../src/buffer";
import { createEventEngine } from "../src/eventEngine";
import { T0, obs, state } from "./helpers";

function setup() {
  let n = 0;
  const store = new AircraftStore(THRESHOLDS);
  const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => `ev-${++n}` });
  const engine = createEventEngine({ store, lifecycle, thresholds: THRESHOLDS });
  return { store, lifecycle, engine };
}

/** Feed one aircraft climbing 1,000 fpm, one position every 7 s. */
function climb(store: AircraftStore, hex: string, polls: number) {
  for (let i = 0; i < polls; i++) {
    store.ingest([state(hex, obs(T0 + i * 7, { altFt: 5000 + Math.round((i * 7 * 1000) / 60), baroRateFpm: 1000 }))]);
  }
  return T0 + (polls - 1) * 7;
}

describe("event engine", () => {
  it("opens a climb event once there is enough history", () => {
    const { store, engine } = setup();
    const now = climb(store, "7c0001", 20);
    const changes = engine.evaluate(now);
    expect(changes.opened.map((e) => [e.hex, e.type])).toEqual([["7c0001", "climb"]]);
  });

  it("reports nothing for an aircraft with too little history", () => {
    const { store, engine } = setup();
    const now = climb(store, "7c0001", 3);
    expect(engine.evaluate(now).opened).toEqual([]);
  });

  it("evaluates aircraft missing from the latest poll, so signal loss is seen", () => {
    const { store, engine } = setup();
    store.ingest([state("7c0001", obs(T0, { altFt: 4500 }))]);
    const changes = engine.evaluate(T0 + 90);
    expect(changes.opened).toHaveLength(1);
    expect(changes.opened[0]).toMatchObject({
      type: "signal_lost",
      evidence: { secondsSinceLastPosition: 90, lastAltFt: 4500 },
    });
  });

  it("passes squawk and emergency through from the aircraft state", () => {
    const { store, engine } = setup();
    store.ingest([state("7c0001", obs(T0), { squawk: "7700", emergency: "general" })]);
    // No emergency detector until phase 10; this checks the context is built without error.
    expect(engine.evaluate(T0).opened).toEqual([]);
  });

  it("drops an aircraft keepSec after its last position and closes its events", () => {
    const { store, lifecycle, engine } = setup();
    store.ingest([state("7c0001", obs(T0))]);
    engine.evaluate(T0 + 90); // signal_lost opens
    expect(lifecycle.openEvents("7c0001")).toHaveLength(1);

    const changes = engine.evaluate(T0 + THRESHOLDS.buffer.keepSec + 1);
    expect(changes.closed.map((e) => e.type)).toEqual(["signal_lost"]);
    expect(store.get("7c0001")).toBeUndefined();
    expect(lifecycle.openEvents()).toEqual([]);
  });
});
