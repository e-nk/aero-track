import { describe, expect, it } from "vitest";
import { parseTraceFile, traceToRecording } from "../src/recordings/globeHistory";

// Shape verified on a real readsb trace (SPEC 5.2).
const DAY = 1_731_024_000; // 2024-11-08 00:00 UTC
const pt = (sec: number, extra: Partial<Record<number, unknown>> = {}) => {
  const p: unknown[] = [sec, -33.95, 151.18, 1500, 160.5, 340.0, 0, 640, null, "adsb_icao", 1600, 650, 150, 0.0];
  for (const [i, v] of Object.entries(extra)) p[Number(i)] = v;
  return p;
};
const file = (trace: unknown[][]) => ({ icao: "7c6db7", r: "VH-VYH", t: "B738", desc: "BOEING 737-800", timestamp: DAY, trace });
const cause = { text: "Engine failure.", sourceUrl: "https://www.atsb.gov.au/investigations/ao-2024-057", sourceName: "ATSB" };
const opts = { title: "Engine failure on take-off", from: DAY + 100, to: DAY + 400, reportedCause: cause };

describe("parseTraceFile", () => {
  it("accepts a real-shaped trace and rejects other things", () => {
    expect(parseTraceFile(file([pt(100)])).icao).toBe("7c6db7");
    expect(() => parseTraceFile({ icao: "7c6db7" })).toThrow();
  });
});

describe("traceToRecording", () => {
  it("converts points to absolute times in the window, with identity and the source's credit", () => {
    const rec = traceToRecording(parseTraceFile(file([pt(50), pt(100, { 8: { flight: "QFA520  ", squawk: "3022", category: "A3" } }), pt(110), pt(500)])), opts);
    expect(rec).toMatchObject({
      mode: "recorded",
      title: "Engine failure on take-off",
      source: "ADSB.lol globe_history archive",
      attribution: "Data: ADSB.lol (ODbL)",
      capturedFrom: DAY + 100,
      capturedTo: DAY + 110,
      reportedCause: cause,
    });
    expect(rec.aircraft).toEqual([
      {
        hex: "7c6db7",
        callsign: "QFA520",
        registration: "VH-VYH",
        typeCode: "B738",
        category: "A3",
        points: [
          [DAY + 100, -33.95, 151.18, 1500, 160.5, 340, 640, false, "3022"],
          [DAY + 110, -33.95, 151.18, 1500, 160.5, 340, 640, false, "3022"], // details carried forward
        ],
      },
    ]);
  });

  it("marks ground points like the live adapter (altitude 0, on the ground)", () => {
    const rec = traceToRecording(parseTraceFile(file([pt(100, { 3: "ground", 4: 12, 7: null })])), opts);
    expect(rec.aircraft[0]!.points[0]).toEqual([DAY + 100, -33.95, 151.18, 0, 12, 340, null, true, null]);
  });

  it("never mixes GPS altitude into the barometric track (flag &8 drops it)", () => {
    const rec = traceToRecording(parseTraceFile(file([pt(100, { 6: 8 }), pt(110)])), opts);
    expect(rec.aircraft[0]!.points.map((p) => p[3])).toEqual([null, 1500]);
  });

  it("uses only the callsign broadcast in the window, never one from later in the day", () => {
    const rec = traceToRecording(parseTraceFile(file([pt(100), pt(900, { 8: { flight: "QFA999" } })])), opts);
    expect(rec.aircraft[0]!.callsign).toBeNull();
  });

  it("leaves missing identity as null", () => {
    const { r, t, ...bare } = file([pt(100)]);
    expect(r && t).toBeTruthy();
    expect(traceToRecording(parseTraceFile(bare), opts).aircraft[0]).toMatchObject({ registration: null, typeCode: null, category: null });
  });

  it("refuses an empty window", () => {
    expect(() => traceToRecording(parseTraceFile(file([pt(50)])), opts)).toThrow("No positions in that window");
  });
});
