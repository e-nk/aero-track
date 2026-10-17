import { THRESHOLDS, type BehaviourEvent, type Detection, type EventType } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { EventLifecycle } from "../src/lifecycle";
import { T0 } from "./fixtures/build";

const { closeAfterSec, reopenCooldownSec } = THRESHOLDS.lifecycle;
const POLL = 7;

function make() {
  let n = 0;
  return new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => `ev-${++n}` });
}

const det = (type: EventType, now: number, evidence: Detection["evidence"] = {}): Detection => ({
  type,
  confidence: type === "signal_lost" ? "fact" : "observed",
  windowStart: now - 60,
  windowEnd: now,
  evidence,
});

const climbAt = (now: number, netFt: number) => det("climb", now, { netFt, spanSec: 60 });

describe("EventLifecycle", () => {
  it("same climb across 10 polls → one event opened, updated, closed once", () => {
    const lc = make();
    const opened: BehaviourEvent[] = [];
    const updated: BehaviourEvent[] = [];
    const closed: BehaviourEvent[] = [];
    const collect = (c: ReturnType<EventLifecycle["step"]>) => {
      opened.push(...c.opened);
      updated.push(...c.updated);
      closed.push(...c.closed);
    };

    let now = T0;
    for (let i = 0; i < 10; i++, now += POLL) collect(lc.step("7c0001", [climbAt(now, 1000 + i * 100)], now));
    for (let i = 0; i < 20; i++, now += POLL) collect(lc.step("7c0001", [], now));

    expect(opened).toHaveLength(1);
    expect(updated).toHaveLength(9);
    expect(closed).toHaveLength(1);
    expect(new Set([...opened, ...updated, ...closed].map((e) => e.id))).toEqual(new Set(["ev-1"]));
    expect(closed[0]).toMatchObject({ status: "closed", evidence: { netFt: 1900 } });
    expect(lc.openEvents()).toEqual([]);
  });

  it("builds the event from the detection with a template explanation", () => {
    const { opened } = make().step("7c0001", [climbAt(T0, 3000)], T0);
    expect(opened[0]).toMatchObject({
      id: "ev-1",
      hex: "7c0001",
      type: "climb",
      confidence: "observed",
      mode: "live",
      status: "open",
      explanationSource: "template",
      openedAt: T0,
      updatedAt: T0,
      closedAt: null,
      windowStart: T0 - 60,
      windowEnd: T0,
    });
    expect(opened[0]!.explanation.seen).toBe("This aircraft has climbed 3,000 ft in the last 1 minute.");
  });

  it("does not emit an update when nothing changed", () => {
    const lc = make();
    lc.step("7c0001", [det("turn", T0, { totalDeg: 40 })], T0);
    const again = lc.step("7c0001", [{ ...det("turn", T0, { totalDeg: 40 }) }], T0 + POLL);
    expect(again).toEqual({ opened: [], updated: [], closed: [] });
  });

  it("keeps the event open through a dropout shorter than closeAfterSec", () => {
    const lc = make();
    lc.step("7c0001", [climbAt(T0, 1000)], T0);
    const quiet = lc.step("7c0001", [], T0 + closeAfterSec - 1);
    expect(quiet.closed).toEqual([]);
    const back = lc.step("7c0001", [climbAt(T0 + closeAfterSec, 1500)], T0 + closeAfterSec);
    expect(back.opened).toEqual([]);
    expect(back.updated.map((e) => e.id)).toEqual(["ev-1"]);
  });

  it("closes once no detection has been seen for closeAfterSec", () => {
    const lc = make();
    lc.step("7c0001", [climbAt(T0, 1000)], T0);
    const c = lc.step("7c0001", [], T0 + closeAfterSec);
    expect(c.closed).toHaveLength(1);
    expect(c.closed[0]).toMatchObject({ closedAt: T0 + closeAfterSec, updatedAt: T0 + closeAfterSec });
  });

  it("does not reopen the same key within reopenCooldownSec", () => {
    const lc = make();
    lc.step("7c0001", [climbAt(T0, 1000)], T0);
    const closeAt = T0 + closeAfterSec;
    lc.step("7c0001", [], closeAt);

    expect(lc.step("7c0001", [climbAt(closeAt + 10, 1000)], closeAt + 10).opened).toEqual([]);
    expect(lc.step("7c0001", [climbAt(closeAt + reopenCooldownSec - 1, 1000)], closeAt + reopenCooldownSec - 1).opened).toEqual([]);
    const reopened = lc.step("7c0001", [climbAt(closeAt + reopenCooldownSec, 1000)], closeAt + reopenCooldownSec);
    expect(reopened.opened.map((e) => e.id)).toEqual(["ev-2"]);
  });

  it("tracks keys per aircraft and per type", () => {
    const lc = make();
    const a = lc.step("7c0001", [climbAt(T0, 1000), det("turn", T0, { totalDeg: 40 })], T0);
    const b = lc.step("7c0002", [climbAt(T0, 1000)], T0);
    expect(a.opened.map((e) => e.type)).toEqual(["climb", "turn"]);
    expect(b.opened).toHaveLength(1);
    expect(lc.openEvents("7c0001")).toHaveLength(2);
    expect(lc.openEvents()).toHaveLength(3);
  });

  it("closes signal_lost as soon as a fresh position arrives", () => {
    const lc = make();
    lc.step("7c0001", [det("signal_lost", T0, { secondsSinceLastPosition: 90 })], T0);
    const c = lc.step("7c0001", [], T0 + POLL);
    expect(c.closed.map((e) => e.type)).toEqual(["signal_lost"]);
  });

  it("closeAll closes every open event for an aircraft that has gone", () => {
    const lc = make();
    lc.step("7c0001", [climbAt(T0, 1000), det("signal_lost", T0, { secondsSinceLastPosition: 90 })], T0);
    lc.step("7c0002", [climbAt(T0, 1000)], T0);
    const c = lc.closeAll("7c0001", T0 + 5);
    expect(c.closed.map((e) => e.type).sort()).toEqual(["climb", "signal_lost"]);
    expect(lc.openEvents().map((e) => e.hex)).toEqual(["7c0002"]);
  });

  it("restored open events are continued, not reopened", () => {
    const first = make();
    const [ev] = first.step("7c0001", [climbAt(T0, 1000)], T0).opened;

    const lc = make();
    lc.restore([ev!]);
    const c = lc.step("7c0001", [climbAt(T0 + POLL, 1200)], T0 + POLL);
    expect(c.opened).toEqual([]);
    expect(c.updated.map((e) => e.id)).toEqual([ev!.id]);
  });

  it("restored events still close on schedule", () => {
    const first = make();
    const [ev] = first.step("7c0001", [climbAt(T0, 1000)], T0).opened;
    const lc = make();
    lc.restore([ev!]);
    expect(lc.step("7c0001", [], T0 + closeAfterSec).closed).toHaveLength(1);
  });

  it("widens the window rather than replacing it", () => {
    const lc = make();
    lc.step("7c0001", [climbAt(T0, 1000)], T0);
    const { updated } = lc.step("7c0001", [{ ...climbAt(T0 + 30, 1300), windowStart: T0 }], T0 + 30);
    expect(updated[0]).toMatchObject({ windowStart: T0 - 60, windowEnd: T0 + 30 });
  });
});
