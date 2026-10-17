import type { BehaviourEvent, EventType } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { earlierEvents } from "../lib/timeline";

const T0 = 1_792_200_000; // 12:20 pm Sydney
const ev = (id: string, type: EventType, openedAt: number, closedAt: number | null): BehaviourEvent => ({
  id,
  hex: "7c0001",
  type,
  confidence: "observed",
  windowStart: openedAt,
  windowEnd: closedAt ?? openedAt,
  evidence: {},
  mode: "live",
  status: closedAt === null ? "open" : "closed",
  explanation: { seen: `seen ${id}`, cannotTell: "c" },
  explanationSource: "template",
  openedAt,
  updatedAt: closedAt ?? openedAt,
  closedAt,
});

describe("earlierEvents", () => {
  it("lists ended events newest first with their times, skipping ones still open", () => {
    const items = earlierEvents(
      [ev("a", "climb", T0, T0 + 240), ev("b", "turn", T0 + 600, T0 + 660), ev("c", "descent", T0 + 900, null)],
      new Set(["c"]),
    );
    expect(items).toEqual([
      { id: "b", title: "Turning", when: "12:30 pm to 12:31 pm", seen: null },
      { id: "a", title: "Climbing", when: "12:20 pm to 12:24 pm", seen: null },
    ]);
  });

  it("drops sliding-window and present-tense sentences, which only describe the last moment of an ended event", () => {
    const types: EventType[] = ["climb", "descent", "turn", "circling", "rapid_descent", "signal_lost", "emergency"];
    const items = earlierEvents(types.map((t, i) => ev(t, t, T0 + i, T0 + 300)), new Set());
    expect(items.map((i) => i.seen)).toEqual(types.map(() => null));
  });

  it("keeps sentences that stay true afterwards, and shows a single time for moments", () => {
    const items = earlierEvents([ev("t", "takeoff", T0, T0 + 960), ev("l", "landing", T0 + 1800, T0 + 2000), ev("g", "gap", T0 + 600, T0 + 700)], new Set());
    expect(items).toEqual([
      { id: "l", title: "Landed", when: "12:50 pm", seen: "seen l" },
      { id: "g", title: "Gap in the data", when: "12:30 pm to 12:31 pm", seen: "seen g" },
      { id: "t", title: "Took off", when: "12:20 pm", seen: "seen t" },
    ]);
  });

  it("is empty when nothing has ended", () => {
    expect(earlierEvents([], new Set())).toEqual([]);
  });
});
