import { describe, expect, it } from "vitest";
import { fromCompact, toCompact } from "../src/compact";
import type { AircraftState } from "../src/types";

const state: AircraftState = {
  hex: "7cb05c",
  callsign: "QLK208D",
  registration: "VH-84E",
  typeCode: "DH8D",
  typeDesc: null,
  category: "A2",
  squawk: "6773",
  emergency: "none",
  last: {
    t: 1792219219.019,
    lat: -34.020655,
    lon: 150.826664,
    altFt: 7000,
    onGround: false,
    gsKt: 245.2,
    trackDeg: 76.08,
    baroRateFpm: -1088,
  },
  lastPosTs: 1792219219.019,
  mode: "live",
};

describe("CompactAircraft", () => {
  it("encodes in the documented order", () => {
    expect(toCompact(state, true)).toEqual([
      "7cb05c",
      "QLK208D",
      -34.020655,
      150.826664,
      7000,
      245.2,
      76.08,
      -1088,
      "DH8D",
      "A2",
      1792219219.019,
      true,
      false,
    ]);
  });

  it("keeps unknown values as null", () => {
    const c = toCompact(
      { ...state, callsign: null, typeCode: null, category: null, last: { ...state.last, altFt: null, gsKt: null, trackDeg: null, baroRateFpm: null } },
      false,
    );
    expect(c).toEqual(["7cb05c", null, -34.020655, 150.826664, null, null, null, null, null, null, 1792219219.019, false, false]);
  });

  it("decodes back to named fields", () => {
    expect(fromCompact(toCompact({ ...state, last: { ...state.last, onGround: true, altFt: 0 } }, false))).toEqual({
      hex: "7cb05c",
      callsign: "QLK208D",
      lat: -34.020655,
      lon: 150.826664,
      altFt: 0,
      gsKt: 245.2,
      trackDeg: 76.08,
      baroRateFpm: -1088,
      typeCode: "DH8D",
      category: "A2",
      lastPosTs: 1792219219.019,
      hasOpenEvent: false,
      onGround: true,
    });
  });
});
