import { parseRecording } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { buildRecording, recordingId } from "../src/recordings/export";
import { T0, obs } from "./helpers";

const rows = [
  { hex: "7c0002", obs: obs(T0 + 14, { lat: -33.8, lon: 151.2 }), squawk: "1000" },
  { hex: "7c0001", obs: obs(T0 + 7, { lat: -33.95, lon: 151.18, onGround: true, altFt: 0 }), squawk: null },
  { hex: "7c0001", obs: obs(T0, { lat: -33.9, lon: 151.0 }), squawk: "3245" },
  { hex: "7c0003", obs: obs(T0 + 5000), squawk: null }, // outside the window
];
const identities = [{ hex: "7c0001", callsign: "QFA1", registration: "VH-OQA", typeCode: "A388", typeDesc: null, category: "A5" }];

describe("recordingId", () => {
  it("uses the Sydney date and a slug of the title", () => {
    expect(recordingId("Evening arrivals, Sydney!", T0)).toBe("2026-10-17-evening-arrivals-sydney");
  });
});

describe("buildRecording", () => {
  const rec = buildRecording({ title: "Test window", from: T0, to: T0 + 600, rows, identities });

  it("produces a valid recording for the window", () => {
    expect(parseRecording(rec)).toEqual(rec);
    expect(rec).toMatchObject({
      id: "2026-10-17-test-window",
      title: "Test window",
      mode: "recorded",
      source: "ADSB.lol live capture",
      attribution: "Data: ADSB.lol (ODbL)",
      capturedFrom: T0,
      capturedTo: T0 + 600,
      reportedCause: null,
    });
  });

  it("groups points by aircraft, sorted, with identity where known", () => {
    expect(rec.aircraft.map((a) => a.hex)).toEqual(["7c0001", "7c0002"]);
    expect(rec.aircraft[0]).toEqual({
      hex: "7c0001",
      callsign: "QFA1",
      registration: "VH-OQA",
      typeCode: "A388",
      category: "A5",
      points: [
        [T0, -33.9, 151.0, 10000, 250, 90, 0, false, "3245"],
        [T0 + 7, -33.95, 151.18, 0, 250, 90, 0, true, null],
      ],
    });
    expect(rec.aircraft[1]).toMatchObject({ callsign: null, registration: null, typeCode: null, category: null });
  });

  it("computes a bounding box around every point", () => {
    expect(rec.bbox).toEqual([151, -33.95, 151.2, -33.8]);
  });

  it("limits to the given aircraft", () => {
    const only = buildRecording({ title: "One", from: T0, to: T0 + 600, rows, identities, hexes: ["7c0002"] });
    expect(only.aircraft.map((a) => a.hex)).toEqual(["7c0002"]);
  });

  it("refuses an empty window", () => {
    expect(() => buildRecording({ title: "Empty", from: T0 + 9000, to: T0 + 9600, rows, identities })).toThrow(/No positions/);
  });
});
