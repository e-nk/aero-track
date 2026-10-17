import { describe, expect, it } from "vitest";
import { dHeading, distanceNm, nearestAirport } from "../src/geo";

describe("dHeading", () => {
  it("takes the short way across north", () => {
    expect(dHeading(350, 10)).toBe(20);
    expect(dHeading(10, 350)).toBe(-20);
  });

  it("is signed: right turns positive, left turns negative", () => {
    expect(dHeading(90, 120)).toBe(30);
    expect(dHeading(120, 90)).toBe(-30);
  });

  it("stays within -180..180", () => {
    expect(Math.abs(dHeading(90, 270))).toBe(180);
    expect(dHeading(0, 0)).toBe(0);
  });
});

describe("distanceNm", () => {
  it("measures one degree of latitude as about 60 nm", () => {
    expect(distanceNm(-34, 151, -33, 151)).toBeCloseTo(60, 0);
  });

  it("is zero for the same point", () => {
    expect(distanceNm(-33.9, 151, -33.9, 151)).toBe(0);
  });
});

describe("nearestAirport", () => {
  it("finds Sydney Airport from its own coordinates", () => {
    expect(nearestAirport(-33.946098, 151.177002, 5)).toMatchObject({ airport: { ident: "YSSY" } });
    expect(nearestAirport(-33.946098, 151.177002, 5)!.km).toBeCloseTo(0, 3);
  });

  it("picks the closer of two nearby airports", () => {
    // Between Bankstown (YSBK) and Holsworthy (YSHW), nearer Bankstown.
    expect(nearestAirport(-33.93, 150.99, 10)!.airport.ident).toBe("YSBK");
  });

  it("returns null when nothing is within range", () => {
    expect(nearestAirport(-33.45, 150.6, 5)).toBeNull();
  });
});
