import { describe, expect, it } from "vitest";
import { adaptStates } from "../../../src/providers/opensky/adapter";
import { parseStates } from "../../../src/providers/opensky/schema";
import { loadOpenSkySample } from "./sample";

const adapt = (body: unknown) => adaptStates(parseStates(body));
// [icao24, callsign, country, time_position, last_contact, lon, lat, baro_alt_m, on_ground, velocity_ms, track, vrate_ms, sensors, geo_alt_m, squawk, spi, source, category]
const row = (patch: Record<number, unknown> = {}) => {
  const r: unknown[] = ["7c0001", "TEST01  ", "Australia", 1000, 1001, 151.0, -33.9, 3048, false, 100, 90, -5.08, null, 3100, "1000", false, 0, 0];
  for (const [i, v] of Object.entries(patch)) r[Number(i)] = v;
  return r;
};

describe("OpenSky adapter on the saved real response", () => {
  const { aircraft, skipped } = adapt(loadOpenSkySample());

  it("keeps every aircraft with a position", () => {
    expect(aircraft).toHaveLength(63);
    expect(skipped).toEqual({ notAircraft: 0, noPosition: 0, rejectedBySchema: 0 });
  });

  it("converts metric units to ft, kt and fpm", () => {
    expect(aircraft.find((a) => a.hex === "89505a")).toEqual({
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
    });
  });

  it("keeps an unknown altitude as null", () => {
    expect(aircraft.some((a) => a.altFt === null)).toBe(true);
  });
});

describe("OpenSky adapter edge cases", () => {
  const body = (...rows: unknown[][]) => ({ time: 1002, states: rows });

  it("handles a null states list", () => {
    expect(adapt({ time: 1, states: null }).aircraft).toEqual([]);
  });

  it("drops states without a position or position time", () => {
    const r = adapt(body(row({ 5: null }), row({ 0: "7c0002", 3: null })));
    expect(r.aircraft).toEqual([]);
    expect(r.skipped.noPosition).toBe(2);
  });

  it("drops surface vehicles and obstacles (categories 16-20)", () => {
    const r = adapt(body(...[16, 17, 18, 19, 20].map((c, i) => row({ 0: `7c000${i}`, 17: c })), row({ 0: "7c0009", 17: 6 })));
    expect(r.aircraft.map((a) => a.hex)).toEqual(["7c0009"]);
    expect(r.skipped.notAircraft).toBe(5);
  });

  it("trims callsigns and treats blank as unknown", () => {
    expect(adapt(body(row({ 1: "        " }))).aircraft[0]!.callsign).toBeNull();
  });

  it("skips a malformed row without dropping the rest", () => {
    const r = adapt(body(["bad"], row()));
    expect(r.aircraft).toHaveLength(1);
    expect(r.skipped.rejectedBySchema).toBe(1);
  });

  it("works without the extended category field", () => {
    expect(adapt(body(row().slice(0, 17))).aircraft).toHaveLength(1);
  });

  it("rejects a body without time", () => {
    expect(() => parseStates({ states: [] })).toThrow();
  });
});
