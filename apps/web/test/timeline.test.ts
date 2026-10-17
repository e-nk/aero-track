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
      { id: "b", title: "Turning", when: "12:30 pm to 12:31 pm", seen: "seen b" },
      { id: "a", title: "Climbing", when: "12:20 pm to 12:24 pm", seen: "seen a" },
    ]);
  });

  it("is empty when nothing has ended", () => {
    expect(earlierEvents([], new Set())).toEqual([]);
  });
});
