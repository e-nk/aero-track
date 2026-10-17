import type { AircraftState } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { adaptResponse } from "../../../src/providers/adsblol/adapter";
import { parseResponse } from "../../../src/providers/adsblol/schema";
import { loadSample } from "./sample";

const NOW_SEC = 1792219219.5;
const adapt = (body: unknown) => adaptResponse(parseResponse(body));
const byHex = (states: AircraftState[], hex: string) => states.find((s) => s.hex === hex);

const minimal = (ac: Record<string, unknown>[]) => ({ now: NOW_SEC * 1000, ac });

describe("adaptResponse on the saved real response", () => {
  const { states, skipped } = adapt(loadSample());

  it("keeps aircraft and drops ground vehicles and towers", () => {
    expect(states).toHaveLength(19);
    expect(skipped).toEqual({ notAircraft: 6, noPosition: 0 });
    for (const hex of ["7cf451", "7cf4ef", "7cf3a5", "7cf452", "7cf7ca", "7cf7cb"]) {
      expect(byHex(states, hex)).toBeUndefined();
    }
  });

  it("maps an airborne aircraft", () => {
    expect(byHex(states, "7cb05c")).toEqual({
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
    } satisfies AircraftState);
  });

  it('maps alt_baro "ground" to 0 ft on the ground, with missing fields as null', () => {
    const s = byHex(states, "7c65d9")!;
    expect(s.last).toMatchObject({ altFt: 0, onGround: true, trackDeg: null, baroRateFpm: null });
    expect(s.last.t).toBeCloseTo(NOW_SEC - 57.691, 3);
  });

  it("treats a missing emergency field as unknown, not 'none'", () => {
    expect(byHex(states, "7c6c96")!.emergency).toBeNull();
  });

  it("keeps a negative barometric altitude", () => {
    expect(byHex(states, "7c7803")!.last.altFt).toBe(-325);
  });

  it("never leaks raw provider fields", () => {
    const keys = Object.keys(byHex(states, "7c146f")!).sort();
    expect(keys).toEqual(
      ["hex", "callsign", "registration", "typeCode", "typeDesc", "category", "squawk", "emergency", "last", "lastPosTs", "mode"].sort(),
    );
  });
});

describe("adaptResponse edge cases", () => {
  const base = { hex: "7c1234", lat: -33.9, lon: 151.0, seen_pos: 1 };

  it("drops aircraft without a position", () => {
    const { states, skipped } = adapt(minimal([{ hex: "7c1234", seen_pos: 1, alt_baro: 3000 }]));
    expect(states).toEqual([]);
    expect(skipped.noPosition).toBe(1);
  });

  it("drops aircraft without seen_pos, since the position time is unknown", () => {
    const { states, skipped } = adapt(minimal([{ hex: "7c1234", lat: -33.9, lon: 151 }]));
    expect(states).toEqual([]);
    expect(skipped.noPosition).toBe(1);
  });

  it("trims the callsign and treats a blank one as unknown", () => {
    const { states } = adapt(minimal([{ ...base, flight: "QFA1    " }, { ...base, hex: "7c1235", flight: "        " }]));
    expect(states.map((s) => s.callsign)).toEqual(["QFA1", null]);
  });

  it("falls back to geom_rate when baro_rate is missing", () => {
    const { states } = adapt(minimal([{ ...base, geom_rate: -640 }]));
    expect(states[0]!.last.baroRateFpm).toBe(-640);
  });

  it("does not use alt_geom when alt_baro is missing", () => {
    const { states } = adapt(minimal([{ ...base, alt_geom: 5000 }]));
    expect(states[0]!.last.altFt).toBeNull();
    expect(states[0]!.last.onGround).toBe(false);
  });

  it("keeps a non-ICAO ~hex as-is", () => {
    const { states } = adapt(minimal([{ ...base, hex: "~2a0b1c" }]));
    expect(states[0]!.hex).toBe("~2a0b1c");
  });

  it("keeps desc when present", () => {
    const { states } = adapt(minimal([{ ...base, desc: "BOEING 737-800" }]));
    expect(states[0]!.typeDesc).toBe("BOEING 737-800");
  });

  it("drops every C category", () => {
    const ac = ["C1", "C2", "C3", "C7"].map((category, i) => ({ ...base, hex: `7c000${i}`, category }));
    expect(adapt(minimal(ac)).states).toEqual([]);
  });
});
