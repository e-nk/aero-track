import { describe, expect, it } from "vitest";
import { fromOverviewCompact, toOverviewCompact, type OverviewAircraft } from "../src/overview";

const a: OverviewAircraft = {
  hex: "89505a",
  callsign: "RBA4070",
  lat: -22.0259,
  lon: 148.399,
  altFt: 37075,
  altGeomFt: 39025,
  gsKt: 399.6,
  trackDeg: 306.55,
  baroRateFpm: 577,
  onGround: false,
  lastPosTs: 1792240515,
};

describe("OverviewCompact", () => {
  it("encodes in the documented order", () => {
    expect(toOverviewCompact(a)).toEqual(["89505a", "RBA4070", -22.0259, 148.399, 37075, 39025, 399.6, 306.55, 577, false, 1792240515]);
  });

  it("round-trips, keeping unknowns as null", () => {
    const unknown = { ...a, callsign: null, altFt: null, altGeomFt: null, gsKt: null, trackDeg: null, baroRateFpm: null };
    expect(fromOverviewCompact(toOverviewCompact(unknown))).toEqual(unknown);
    expect(fromOverviewCompact(toOverviewCompact(a))).toEqual(a);
  });
});
