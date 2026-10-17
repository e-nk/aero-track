import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  formatAge,
  formatAltitude,
  formatHeading,
  formatSpeed,
  formatType,
  formatVerticalRate,
} from "../lib/format";

describe("details formatting", () => {
  it("altitude", () => {
    expect(formatAltitude(7000, false)).toBe("7,000 ft");
    expect(formatAltitude(-325, false)).toBe("-325 ft");
    expect(formatAltitude(0, true)).toBe("On the ground");
    expect(formatAltitude(null, false)).toBe(NOT_AVAILABLE);
  });

  it("speed in knots with a plain km/h conversion", () => {
    expect(formatSpeed(245.2)).toBe("245 knots (about 454 km/h)");
    expect(formatSpeed(null)).toBe(NOT_AVAILABLE);
  });

  it("heading with a compass word", () => {
    expect(formatHeading(76.08)).toBe("76° (east)");
    expect(formatHeading(350)).toBe("350° (north)");
    expect(formatHeading(225)).toBe("225° (south-west)");
    expect(formatHeading(null)).toBe(NOT_AVAILABLE);
  });

  it("vertical rate in words", () => {
    expect(formatVerticalRate(-1088, 100)).toBe("Descending about 1,100 ft per minute");
    expect(formatVerticalRate(2592, 100)).toBe("Climbing about 2,600 ft per minute");
    expect(formatVerticalRate(64, 100)).toBe("Level");
    expect(formatVerticalRate(null, 100)).toBe(NOT_AVAILABLE);
  });

  it("position age", () => {
    expect(formatAge(0.4)).toBe("just now");
    expect(formatAge(12.4)).toBe("12 s ago");
    expect(formatAge(185)).toBe("3 min ago");
  });

  it("type code with description when known", () => {
    expect(formatType("B738", "BOEING 737-800")).toBe("B738 · BOEING 737-800");
    expect(formatType("B738", null)).toBe("B738");
    expect(formatType(null, null)).toBe(NOT_AVAILABLE);
  });
});
