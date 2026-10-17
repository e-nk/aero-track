import { describe, expect, it } from "vitest";
import { airlineForCallsign, flightNumberCallsigns, normaliseQuery, parseSearch } from "../src/search";

describe("normaliseQuery", () => {
  it("upper-cases and drops spaces and dashes", () => {
    expect(normaliseQuery(" vh-xzp ")).toBe("VHXZP");
    expect(normaliseQuery("qf 1")).toBe("QF1");
  });
});

describe("flightNumberCallsigns", () => {
  it("maps an airline flight number to the ICAO callsign", () => {
    expect(flightNumberCallsigns("QF1")).toEqual([{ callsign: "QFA1", airline: "Qantas" }]);
    expect(flightNumberCallsigns("VA820")).toEqual([{ callsign: "VOZ820", airline: "Virgin Australia" }]);
    expect(flightNumberCallsigns("JQ524")).toEqual([{ callsign: "JST524", airline: "Jetstar Airways" }]);
  });

  it("drops leading zeros and keeps a letter suffix", () => {
    expect(flightNumberCallsigns("QF001")[0]!.callsign).toBe("QFA1");
    expect(flightNumberCallsigns("QF1A")[0]!.callsign).toBe("QFA1A");
  });

  it("returns every airline that shares an IATA code", () => {
    expect(flightNumberCallsigns("SQ221").map((c) => c.callsign)).toEqual(["SIA221", "SQC221"]);
  });

  it("returns nothing for unknown codes or things that aren't flight numbers", () => {
    expect(flightNumberCallsigns("ZZ1")).toEqual([]); // no airline uses ZZ
    expect(flightNumberCallsigns("QFA1")).toEqual([]);
    expect(flightNumberCallsigns("QF")).toEqual([]);
  });
});

describe("airlineForCallsign", () => {
  it("names the airline from the callsign prefix", () => {
    expect(airlineForCallsign("QFA123")).toEqual({ icao: "QFA", name: "Qantas" });
    expect(airlineForCallsign("VOZ820")).toEqual({ icao: "VOZ", name: "Virgin Australia" });
  });

  it("returns null when the prefix isn't an airline code", () => {
    expect(airlineForCallsign("N123AB")).toBeNull();
    expect(airlineForCallsign(null)).toBeNull();
    expect(airlineForCallsign("QF")).toBeNull();
  });
});

describe("parseSearch", () => {
  it("covers every way a query could match", () => {
    expect(parseSearch("qf1")).toEqual({
      query: "QF1",
      callsign: "QF1",
      flightCallsigns: [{ callsign: "QFA1", airline: "Qantas" }],
      registration: "QF1",
      typeCode: "QF1",
    });
  });

  it("does not treat long queries as a type designator", () => {
    expect(parseSearch("VH-XZP")?.typeCode).toBeNull();
  });

  it("rejects queries that are too short or too long", () => {
    expect(parseSearch("Q")).toBeNull();
    expect(parseSearch("X".repeat(21))).toBeNull();
  });
});
