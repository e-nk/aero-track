import { parseRecording } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { buildRecording, recordingId } from "../src/recordings/export";
import { T0, obs } from "./helpers";

const rows = [
  { hex: "7c0002", obs: obs(T0 + 14, { lat: -33.8, lon: 151.2 }), squawk: "1000", callsign: null },
  { hex: "7c0001", obs: obs(T0 + 7, { lat: -33.95, lon: 151.18, onGround: true, altFt: 0 }), squawk: null, callsign: null },
  { hex: "7c0001", obs: obs(T0, { lat: -33.9, lon: 151.0 }), squawk: "3245", callsign: null },
  { hex: "7c0003", obs: obs(T0 + 5000), squawk: null, callsign: null }, // outside the window
];
// Not seen again after the windows used here, so its stored callsign was the one in use.
const identities = [{ hex: "7c0001", callsign: "QFA1", registration: "VH-OQA", typeCode: "A388", typeDesc: null, category: "A5", lastSeenAt: T0 + 14 }];

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
      capturedTo: T0 + 14,
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

  it("covers only the time the data actually spans, within the requested window", () => {
    const late = buildRecording({ title: "Late start", from: T0 - 300, to: T0 + 600, rows, identities });
    expect([late.capturedFrom, late.capturedTo]).toEqual([T0, T0 + 14]);
  });

  it("uses the callsign broadcast during the window, not a later one", () => {
    const withCallsigns = [
      { hex: "7c0001", obs: obs(T0), squawk: null, callsign: "AAR601" },
      { hex: "7c0001", obs: obs(T0 + 7), squawk: null, callsign: "AAR601" },
    ];
    const later = [{ hex: "7c0001", callsign: "AAR602", registration: "HL7775", typeCode: "B772", typeDesc: null, category: "A5", lastSeenAt: T0 + 9000 }];
    const rec = buildRecording({ title: "T", from: T0, to: T0 + 600, rows: withCallsigns, identities: later });
    expect(rec.aircraft[0]).toMatchObject({ callsign: "AAR601", registration: "HL7775" });
  });

  it("for positions saved without a callsign, trusts the stored callsign only if the aircraft wasn't seen again later", () => {
    const old = [{ hex: "7c0001", obs: obs(T0), squawk: null, callsign: null }];
    const seenLater = [{ hex: "7c0001", callsign: "AAR602", registration: null, typeCode: null, typeDesc: null, category: null, lastSeenAt: T0 + 9000 }];
    const notSeenLater = [{ ...seenLater[0]!, lastSeenAt: T0 + 300 }];
    expect(buildRecording({ title: "T", from: T0, to: T0 + 600, rows: old, identities: seenLater }).aircraft[0]!.callsign).toBeNull();
    expect(buildRecording({ title: "T", from: T0, to: T0 + 600, rows: old, identities: notSeenLater }).aircraft[0]!.callsign).toBe("AAR602");
  });

  it("limits to the given aircraft", () => {
    const only = buildRecording({ title: "One", from: T0, to: T0 + 600, rows, identities, hexes: ["7c0002"] });
    expect(only.aircraft.map((a) => a.hex)).toEqual(["7c0002"]);
  });

  it("refuses an empty window", () => {
    expect(() => buildRecording({ title: "Empty", from: T0 + 9000, to: T0 + 9600, rows, identities })).toThrow(/No positions/);
  });
});
