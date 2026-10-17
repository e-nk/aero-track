import { THRESHOLDS } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { AircraftStore } from "../src/buffer";
import { T0, obs, state } from "./helpers";

const KEEP = THRESHOLDS.buffer.keepSec;

describe("AircraftStore", () => {
  it("stores a new aircraft and returns its new observation", () => {
    const store = new AircraftStore(THRESHOLDS);
    const added = store.ingest([state("7c0001", obs(T0))]);
    expect(added).toEqual([{ hex: "7c0001", obs: obs(T0), squawk: "1000", callsign: "TEST01" }]);
    expect(store.track("7c0001")).toEqual([obs(T0)]);
    expect(store.get("7c0001")?.callsign).toBe("TEST01");
  });

  it("ignores an observation that is not newer than the last one", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0 + 7))]);
    expect(store.ingest([state("7c0001", obs(T0 + 7))])).toEqual([]);
    expect(store.ingest([state("7c0001", obs(T0))])).toEqual([]);
    expect(store.track("7c0001")).toHaveLength(1);
  });

  it("refreshes identity fields even when the position is unchanged", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0))]);
    store.ingest([state("7c0001", obs(T0), { squawk: "7700", callsign: "TEST02" })]);
    expect(store.get("7c0001")).toMatchObject({ squawk: "7700", callsign: "TEST02", lastPosTs: T0 });
  });

  it("keeps the newest position when a stale one arrives", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0 + 7, { altFt: 11000 }))]);
    store.ingest([state("7c0001", obs(T0, { altFt: 9000 }))]);
    expect(store.get("7c0001")).toMatchObject({ lastPosTs: T0 + 7, last: { altFt: 11000 } });
  });

  it("filters a track by start time", () => {
    const store = new AircraftStore(THRESHOLDS);
    for (let i = 0; i < 5; i++) store.ingest([state("7c0001", obs(T0 + i * 7))]);
    expect(store.track("7c0001", T0 + 14).map((o) => o.t)).toEqual([T0 + 14, T0 + 21, T0 + 28]);
    expect(store.track("nope")).toEqual([]);
  });

  it("prune trims observations older than keepSec", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0))]);
    store.ingest([state("7c0001", obs(T0 + 100))]);
    expect(store.prune(T0 + KEEP + 50)).toEqual([]);
    expect(store.track("7c0001").map((o) => o.t)).toEqual([T0 + 100]);
  });

  it("prune drops an aircraft keepSec after its last position and reports it", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0)), state("7c0002", obs(T0 + 60))]);
    expect(store.prune(T0 + KEEP)).toEqual([]);
    expect(store.prune(T0 + KEEP + 1)).toEqual(["7c0001"]);
    expect(store.get("7c0001")).toBeUndefined();
    expect(store.all().map((s) => s.hex)).toEqual(["7c0002"]);
  });

  it("prune keeps followed aircraft and their last position, however long the gap", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0)), state("7c0002", obs(T0))]);
    store.ingest([state("7c0001", obs(T0 + 7))]);
    expect(store.prune(T0 + 5 * 3600, new Set(["7c0001"]))).toEqual(["7c0002"]);
    expect(store.get("7c0001")?.lastPosTs).toBe(T0 + 7);
    expect(store.track("7c0001")).toEqual([obs(T0 + 7)]);
  });

  it("hydrate loads tracks and states, then ingest continues from them", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.hydrate([state("7c0001", obs(T0 + 7))], new Map([["7c0001", [obs(T0), obs(T0 + 7)]]]));
    expect(store.track("7c0001")).toHaveLength(2);
    expect(store.ingest([state("7c0001", obs(T0 + 7))])).toEqual([]);
    expect(store.ingest([state("7c0001", obs(T0 + 14))])).toHaveLength(1);
  });

  it("does not let callers mutate stored tracks", () => {
    const store = new AircraftStore(THRESHOLDS);
    store.ingest([state("7c0001", obs(T0))]);
    store.track("7c0001").push(obs(T0 + 7));
    expect(store.track("7c0001")).toHaveLength(1);
  });
});
