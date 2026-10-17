import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS, fromCompact } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { AircraftStore } from "../src/buffer";
import { changeMessages, snapshotMessage, statusMessage } from "../src/streamMessages";
import { T0, obs, state } from "./helpers";

function setup() {
  let n = 0;
  const store = new AircraftStore(THRESHOLDS);
  const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => `ev-${++n}` });
  return { store, lifecycle };
}

const turn = (now: number) => ({
  type: "turn" as const,
  confidence: "observed" as const,
  windowStart: now,
  windowEnd: now,
  evidence: { totalDeg: 40 },
});

describe("stream messages", () => {
  it("snapshot carries mode, feed status and compact aircraft", () => {
    const { store, lifecycle } = setup();
    store.ingest([state("7c0001", obs(T0)), state("7c0002", obs(T0, { onGround: true, altFt: 0 }))]);
    lifecycle.step("7c0001", [turn(T0)], T0);

    const [event, data] = snapshotMessage({ store, lifecycle, feedStatus: "ok", now: T0 });
    expect(event).toBe("snapshot");
    expect(data.now).toBe(T0);
    expect(data.mode).toBe("live");
    expect(data.feedStatus).toBe("ok");
    const byHex = new Map(data.aircraft.map((c) => [c[0], fromCompact(c)]));
    expect(byHex.get("7c0001")).toMatchObject({ hasOpenEvent: true, onGround: false });
    expect(byHex.get("7c0002")).toMatchObject({ hasOpenEvent: false, onGround: true, altFt: 0 });
  });

  it("status message", () => {
    expect(statusMessage({ feedStatus: "down", lastPollAt: 123, consecutiveFailures: 2 })).toEqual([
      "status",
      { feedStatus: "down", lastPollAt: 123 },
    ]);
  });

  it("maps lifecycle changes to event_open, event_update and event_close", () => {
    const { lifecycle } = setup();
    const opened = lifecycle.step("7c0001", [turn(T0)], T0);
    const updated = lifecycle.step("7c0001", [{ ...turn(T0 + 7), evidence: { totalDeg: 60 } }], T0 + 7);
    const closed = lifecycle.step("7c0001", [], T0 + 7 + THRESHOLDS.lifecycle.closeAfterSec);

    const msgs = changeMessages({
      opened: opened.opened,
      updated: updated.updated,
      closed: closed.closed,
    });
    expect(msgs.map(([e]) => e)).toEqual(["event_open", "event_update", "event_close"]);
    expect(msgs[0]![1]).toMatchObject({ id: "ev-1", status: "open", explanation: expect.any(Object) });
    expect(msgs[2]![1]).toEqual({ id: "ev-1", hex: "7c0001", closedAt: T0 + 7 + THRESHOLDS.lifecycle.closeAfterSec });
  });
});
