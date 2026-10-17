import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  displayAltitude,
  formatSightings,
  formatAge,
  formatHeading,
  formatSpeed,
  formatType,
  formatVerticalRate,
} from "../lib/format";

describe("details formatting", () => {
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

describe("displayed altitude", () => {
  it("prefers GPS altitude, labelled", () => {
    expect(displayAltitude({ altFt: 4300, altGeomFt: 4750, onGround: false })).toEqual({
      text: "4,750 ft (GPS)",
      ft: 4750,
      note: null,
    });
  });

  it("falls back to labelled pressure altitude with a plain note", () => {
    expect(displayAltitude({ altFt: -125, altGeomFt: null, onGround: false })).toEqual({
      text: "-125 ft (pressure altitude)",
      ft: -125,
      note: "Measured against standard air pressure, so it can differ from the real height by a few hundred feet.",
    });
  });

  it("says on the ground, or not available", () => {
    expect(displayAltitude({ altFt: 0, altGeomFt: 150, onGround: true })).toEqual({ text: "On the ground", ft: 0, note: null });
    expect(displayAltitude({ altFt: null, altGeomFt: null, onGround: false })).toEqual({ text: NOT_AVAILABLE, ft: null, note: null });
  });
});

describe("sightings", () => {
  const firstSeenAt = 1_792_200_000; // 17 Oct 2026 in Sydney
  it("counts in plain words with an honest note", () => {
    expect(formatSightings({ last7Days: 3, total: 5, firstSeenAt })).toEqual({
      text: "3 times in the last 7 days",
      note: "Counts only what our coverage showed, since 17 Oct 2026. Not a full flight history.",
    });
    expect(formatSightings({ last7Days: 1, total: 1, firstSeenAt })?.text).toBe("Once in the last 7 days");
  });

  it("handles no data", () => {
    expect(formatSightings(undefined)).toBeNull();
    expect(formatSightings({ last7Days: 0, total: 0, firstSeenAt: null })).toBeNull();
  });
});
