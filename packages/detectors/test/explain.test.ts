import type { Detection, EventType } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { explain, formatDuration } from "../src/explain";
import { T0 } from "./fixtures/build";

const det = (type: EventType, evidence: Detection["evidence"]): Detection => ({
  type,
  confidence: "observed",
  windowStart: T0,
  windowEnd: T0 + 60,
  evidence,
});

describe("formatDuration", () => {
  it.each([
    [7, "10 seconds"],
    [42, "40 seconds"],
    [45, "50 seconds"],
    [56, "1 minute"],
    [61, "1 minute"],
    [180, "3 minutes"],
    [182, "3 minutes"],
  ])("%i s → %s", (sec, text) => {
    expect(formatDuration(sec)).toBe(text);
  });
});

describe("explain", () => {
  it("climb", () => {
    expect(explain(det("climb", { netFt: 3000, spanSec: 182 }))).toEqual({
      seen: "This aircraft has climbed 3,000 ft in the last 3 minutes.",
      commonly: "Aircraft climb after take-off and when moving to a new cruising level.",
      cannotTell: "The data doesn't show why it is climbing.",
    });
  });

  it("descent rounds to 100 ft and drops the sign", () => {
    expect(explain(det("descent", { netFt: -2460, spanSec: 120 })).seen).toBe(
      "This aircraft has descended 2,500 ft in the last 2 minutes.",
    );
  });

  it("turn", () => {
    expect(explain(det("turn", { totalDeg: 40, direction: "right", spanSec: 42 })).seen).toBe(
      "This aircraft has turned 40° to the right in the last 40 seconds.",
    );
  });

  it("turn shows the size of a left turn without a sign", () => {
    expect(explain(det("turn", { totalDeg: -63.4, direction: "left", spanSec: 21 })).seen).toBe(
      "This aircraft has turned 63° to the left in the last 20 seconds.",
    );
  });

  it("circling rounds the altitude spread up, since 'within' is an upper bound", () => {
    expect(
      explain(det("circling", { totalDeg: 412, spanSec: 300, altSpreadFt: 140, laps: 1, direction: "left" })).seen,
    ).toBe("This aircraft has turned through 412° in 5 minutes, staying within 200 ft of the same altitude.");
  });

  it("rapid descent has no 'commonly' part", () => {
    const e = explain(det("rapid_descent", { peakRateFpm: -6040 }));
    expect(e.seen).toBe("This aircraft is descending unusually quickly, about 6,000 ft per minute.");
    expect(e.commonly).toBeUndefined();
  });

  it("signal lost after 180 s says 3 minutes", () => {
    expect(explain(det("signal_lost", { secondsSinceLastPosition: 180 })).seen).toBe(
      "No new position for 3 minutes.",
    );
  });

  it("glitch", () => {
    expect(explain(det("glitch", { glitchAltFt: 18000, expectedAltFt: 10000 }))).toEqual({
      seen: "One altitude reading was inconsistent and has been ignored.",
      commonly: "Single bad readings are a normal part of radio data.",
      cannotTell: "It doesn't reflect a real change in altitude.",
    });
  });

  it("gap shows Sydney clock times", () => {
    const e = explain(det("gap", { gapStart: T0, gapEnd: T0 + 180, gapSec: 180 }));
    expect(e.seen).toBe("No data between 12:20 pm and 12:23 pm.");
    expect(e.commonly).toBeUndefined();
  });

  it("gap can use another time zone", () => {
    const e = explain(det("gap", { gapStart: T0, gapEnd: T0 + 180, gapSec: 180 }), { timeZone: "UTC" });
    expect(e.seen).toBe("No data between 1:20 am and 1:23 am.");
  });

  it("emergency", () => {
    const e = explain(det("emergency", { squawk: "7700" }));
    expect(e.seen).toBe("This aircraft is transmitting an emergency code.");
    expect(e.commonly).toBeUndefined();
    expect(e.cannotTell).toBe("The code alone doesn't tell us the reason.");
  });

  it("says 'Not available' instead of inventing missing numbers", () => {
    expect(explain(det("climb", {})).seen).toBe(
      "This aircraft has climbed Not available ft in the last Not available.",
    );
  });
});
