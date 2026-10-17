import { describe, expect, it } from "vitest";
import { parseRecording, pointToObservation, type RecordingFile } from "../src/recording";

const valid: RecordingFile = {
  id: "2026-10-18-sydney-evening",
  title: "Evening arrivals, Sydney",
  mode: "recorded",
  source: "ADSB.lol live capture",
  attribution: "Data: ADSB.lol (ODbL)",
  capturedFrom: 1792200000,
  capturedTo: 1792200900,
  bbox: [150.5, -34.3, 151.6, -33.4],
  reportedCause: null,
  aircraft: [
    {
      hex: "7c6b2d",
      callsign: "QFA432",
      registration: "VH-VXA",
      typeCode: "B738",
      category: "A3",
      points: [
        [1792200000, -33.71, 151.32, 7000, 230, 182, -64, false, "3245"],
        [1792200007, -33.72, 151.32, null, null, null, null, true, null],
      ],
    },
  ],
};

describe("recording format", () => {
  it("accepts a valid recording", () => {
    expect(parseRecording(valid)).toEqual(valid);
  });

  it("accepts a recorded reportedCause", () => {
    const withCause = { ...valid, reportedCause: { text: "Bird strike", sourceUrl: "https://example.com", sourceName: "Example" } };
    expect(parseRecording(withCause).reportedCause?.sourceName).toBe("Example");
  });

  it("rejects a recording that mixes in live data", () => {
    expect(() => parseRecording({ ...valid, mode: "live" })).toThrow();
  });

  it("rejects malformed points", () => {
    const bad = JSON.parse(JSON.stringify(valid)) as { aircraft: { points: unknown[] }[] };
    bad.aircraft[0]!.points[0] = [1, 2];
    expect(() => parseRecording(bad)).toThrow();
  });

  it("turns a point into an Observation for the detectors", () => {
    expect(pointToObservation(valid.aircraft[0]!.points[0]!)).toEqual({
      t: 1792200000,
      lat: -33.71,
      lon: 151.32,
      altFt: 7000,
      onGround: false,
      gsKt: 230,
      trackDeg: 182,
      baroRateFpm: -64,
    });
  });
});
