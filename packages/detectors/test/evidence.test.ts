import type { Detection, EventType } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { describeEvidence } from "../src/evidence";
import { T0 } from "./fixtures/build";

const det = (type: EventType, evidence: Detection["evidence"]): Detection => ({
  type,
  confidence: "observed",
  windowStart: T0,
  windowEnd: T0 + 60,
  evidence,
});

describe("describeEvidence", () => {
  it("climb from altitude readings", () => {
    expect(
      describeEvidence(
        det("climb", { basis: "altitude", startAltFt: 5000, endAltFt: 8025, netFt: 3025, spanSec: 182, avgRateFpm: 997, obs: 27 }),
      ),
    ).toEqual([
      "Altitude went from 5,000 ft to 8,000 ft.",
      "Over 3 minutes, from 27 position reports.",
      "Average rate about 1,000 ft per minute.",
      "Based on the altitude the aircraft reports.",
    ]);
  });

  it("descent from reported vertical speed, without altitudes", () => {
    expect(describeEvidence(det("descent", { basis: "vertical_rate", spanSec: 70, avgRateFpm: -640, obs: 11 }))).toEqual([
      "Over 1 minute, from 11 position reports.",
      "Average rate about 600 ft per minute.",
      "Based on the vertical speed the aircraft reports.",
    ]);
  });

  it("turn", () => {
    expect(describeEvidence(det("turn", { totalDeg: -63.4, direction: "left", spanSec: 21 }))).toEqual([
      "Direction of travel changed by 63° to the left.",
      "Over 20 seconds.",
      "Very small changes are ignored as noise.",
    ]);
  });

  it("circling", () => {
    expect(
      describeEvidence(det("circling", { totalDeg: 412, laps: 1, spanSec: 300, altSpreadFt: 140, direction: "left" })),
    ).toEqual(["Turned through 412° in total, about 1 full circle.", "Over 5 minutes.", "Altitude stayed within 200 ft."]);
  });

  it("rapid descent", () => {
    expect(
      describeEvidence(
        det("rapid_descent", { peakRateFpm: -6040, avgRateFpm: -5800, spanSec: 40, startAltFt: 12000, endAltFt: 8100 }),
      ),
    ).toEqual([
      "Fastest descent about 6,000 ft per minute.",
      "Average about 5,800 ft per minute.",
      "Altitude went from 12,000 ft to 8,100 ft.",
      "Over 40 seconds.",
    ]);
  });

  it("signal lost", () => {
    expect(
      describeEvidence(det("signal_lost", { secondsSinceLastPosition: 180, lastAltFt: 4500, lastLat: -33.9, lastLon: 151.0 })),
    ).toEqual(["Last position received 3 minutes ago.", "Last known altitude 4,500 ft.", "Last known position 33.90° S, 151.00° E."]);
  });

  it("glitch", () => {
    expect(
      describeEvidence(det("glitch", { glitchAltFt: 18000, expectedAltFt: 10000, impliedRateFpm: 68571, at: T0, count: 1 })),
    ).toEqual([
      "One reading showed 18,000 ft while the readings around it were about 10,000 ft.",
      "That change would need about 68,600 ft per minute, and the next reading returned to normal.",
    ]);
  });

  it("glitch mentions repeats", () => {
    expect(
      describeEvidence(det("glitch", { glitchAltFt: 18000, expectedAltFt: 10000, impliedRateFpm: 68571, at: T0, count: 3 })),
    ).toContain("This happened 3 times in the recent track.");
  });

  it("gap uses Sydney clock times", () => {
    expect(describeEvidence(det("gap", { gapStart: T0, gapEnd: T0 + 180, gapSec: 180 }))).toEqual([
      "No position reports for 3 minutes.",
      "From 12:20 pm to 12:23 pm.",
    ]);
  });

  it("emergency", () => {
    expect(describeEvidence(det("emergency", { squawk: "7700", emergency: "general" }))).toEqual([
      "Transponder code 7700.",
      "Emergency status reported by the aircraft: general.",
    ]);
  });

  it("take-off", () => {
    expect(
      describeEvidence(det("takeoff", { at: T0, airport: "YSSY", airportName: "Sydney Kingsford Smith International Airport", airportKm: 1.24, altFt: 620 })),
    ).toEqual([
      "The aircraft reported being on the ground, then airborne from 12:20 pm.",
      "About 1.2 km from Sydney Kingsford Smith International Airport.",
      "It had climbed to 600 ft a few reports later.",
    ]);
    expect(describeEvidence(det("takeoff", { at: T0 }))).toContain("Not near any airport in our list.");
  });

  it("landing", () => {
    expect(describeEvidence(det("landing", { at: T0, airport: "YSBK", airportName: "Sydney Bankstown Airport", airportKm: 0.8 }))).toEqual([
      "The aircraft reported being airborne, then on the ground from 12:20 pm.",
      "About 0.8 km from Sydney Bankstown Airport.",
    ]);
  });

  it("signal lost near an airport says where it was last seen, never that it landed", () => {
    const lines = describeEvidence(
      det("signal_lost", {
        secondsSinceLastPosition: 180,
        lastAltFt: 1200,
        lastVertical: "descending",
        nearAirport: "YSSY",
        nearAirportName: "Sydney Kingsford Smith International Airport",
        nearAirportKm: 8.3,
      }),
    );
    expect(lines).toContain("Last seen about 8 km from Sydney Kingsford Smith International Airport, descending.");
    expect(lines.join(" ")).not.toMatch(/landed/i);
  });

  it("leaves out anything the evidence doesn't contain", () => {
    expect(describeEvidence(det("climb", {}))).toEqual([]);
    expect(describeEvidence(det("signal_lost", { secondsSinceLastPosition: 90 }))).toEqual([
      "Last position received 2 minutes ago.",
    ]);
  });
});
