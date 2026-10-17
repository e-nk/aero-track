import type { OverviewAircraft } from "@aerotrack/shared";
import { describe, expect, it, vi } from "vitest";
import { airlineOptions, filterAircraft, filterOverview, freshnessText, typeClassOptions } from "../lib/filters";
import type { LiveAircraft } from "../lib/liveState";
import { searchAircraft } from "../lib/searchApi";

const live = (hex: string, callsign: string | null, typeCode: string | null, category: string | null = null): LiveAircraft => ({
  hex, callsign, typeCode, category, lat: 0, lon: 0, altFt: 1000, gsKt: 200, trackDeg: 0, baroRateFpm: 0,
  lastPosTs: 0, hasOpenEvent: false, onGround: false, altGeomFt: null, receivedAtMs: 0, serverNow: 0,
});
const ov = (hex: string, callsign: string | null): OverviewAircraft => ({
  hex, callsign, lat: 0, lon: 0, altFt: 1000, altGeomFt: null, gsKt: 200, trackDeg: 0, baroRateFpm: 0, onGround: false, lastPosTs: 0,
});

const fleet = [live("a", "QFA1", "A388"), live("b", "VOZ820", "B738"), live("c", "QFA2", "DH8D"), live("d", "N123AB", null)];

describe("filters", () => {
  it("filters by airline from the callsign prefix", () => {
    expect(filterAircraft(fleet, { airline: "QFA", typeClass: null }).map((a) => a.hex)).toEqual(["a", "c"]);
  });

  it("filters by aircraft type class", () => {
    expect(filterAircraft(fleet, { airline: null, typeClass: "narrowbody" }).map((a) => a.hex)).toEqual(["b"]);
    expect(filterAircraft(fleet, { airline: "QFA", typeClass: "turboprop" }).map((a) => a.hex)).toEqual(["c"]);
  });

  it("passes everything through with no filters", () => {
    expect(filterAircraft(fleet, { airline: null, typeClass: null })).toHaveLength(4);
  });

  it("overview aircraft have no type, so only 'unknown type' keeps them", () => {
    const list = [ov("x", "QFA9"), ov("y", "JST1")];
    expect(filterOverview(list, { airline: "QFA", typeClass: null }).map((a) => a.hex)).toEqual(["x"]);
    expect(filterOverview(list, { airline: null, typeClass: "widebody" })).toEqual([]);
    expect(filterOverview(list, { airline: null, typeClass: "unknown" })).toHaveLength(2);
  });

  it("offers only airlines and classes that are on the map, most common first", () => {
    expect(airlineOptions(fleet.map((a) => a.callsign), [ov("x", "VOZ5")])).toEqual([
      { icao: "QFA", name: "Qantas", count: 2 },
      { icao: "VOZ", name: "Virgin Australia", count: 2 },
    ]);
    expect(typeClassOptions(fleet)).toEqual(["narrowbody", "widebody", "turboprop", "unknown"]);
  });
});

describe("freshnessText", () => {
  it("says it plainly", () => {
    expect(freshnessText("live")).toBe("Live now");
    expect(freshnessText("last_seen_1m")).toBe("Last seen 1 min ago");
    expect(freshnessText("last_seen_95m")).toBe("Last seen 2 hours ago");
    expect(freshnessText("not_seen")).toBe("Not seen recently");
  });
});

describe("searchAircraft", () => {
  it("calls the search endpoint", async () => {
    const body = { query: "QF1", results: [], message: "x" };
    const f = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    expect(await searchAircraft("qf 1", f)).toEqual(body);
    expect(f).toHaveBeenCalledWith("http://localhost:8080/api/search?q=qf%201", expect.anything());
  });

  it("says something calm when the server can't be reached", async () => {
    const down = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await searchAircraft("QF1", down)).toEqual({ query: "QF1", results: [], message: "Search isn't available right now. Please try again." });
  });
});
