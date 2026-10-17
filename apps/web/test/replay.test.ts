import { THRESHOLDS, type RecordingFile, type RecordingPoint } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { ReplayEngine } from "../lib/replay/engine";

const T0 = 1_792_200_000;

/** One aircraft climbing 1,000 fpm, a report every 7 s, from T0 for `sec` seconds. */
function climbing(hex: string, sec: number, start = T0): RecordingPoint[] {
  const pts: RecordingPoint[] = [];
  for (let t = 0; t <= sec; t += 7) {
    pts.push([start + t, -33.9 + t * 0.0001, 151.0, 5000 + Math.round((t * 1000) / 60), 250, 0, 1000, false, "1000"]);
  }
  return pts;
}

const recording = (): RecordingFile => ({
  id: "test",
  title: "Test",
  mode: "recorded",
  source: "test",
  attribution: "Data: ADSB.lol (ODbL)",
  capturedFrom: T0,
  capturedTo: T0 + 600,
  bbox: [150, -35, 152, -33],
  reportedCause: null,
  aircraft: [
    { hex: "7c0001", callsign: "QFA1", registration: "VH-OQA", typeCode: "A388", category: "A5", points: climbing("7c0001", 300) },
    // Appears later, and stops reporting after 70 s.
    { hex: "7c0002", callsign: null, registration: null, typeCode: null, category: null, points: climbing("7c0002", 70, T0 + 100) },
  ],
});

describe("ReplayEngine", () => {
  it("knows the recording's time span", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    expect([e.start, e.end]).toEqual([T0, T0 + 600]);
  });

  it("shows only aircraft that have reported by the replay clock, at their latest position", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 50);
    const now = e.aircraft(1000);
    expect(now.map((a) => a.hex)).toEqual(["7c0001"]);
    expect(now[0]).toMatchObject({ callsign: "QFA1", typeCode: "A388", lastPosTs: T0 + 49, serverNow: T0 + 50, receivedAtMs: 1000 });
    e.advanceTo(T0 + 120);
    expect(e.aircraft(0).map((a) => a.hex)).toEqual(["7c0001", "7c0002"]);
  });

  it("runs the detectors on replay time, in recorded mode", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    const changes = e.advanceTo(T0 + 120);
    const climb = changes.opened.find((ev) => ev.hex === "7c0001" && ev.type === "climb");
    expect(climb).toMatchObject({ mode: "recorded", explanationSource: "template" });
    expect(e.openEvents().some((ev) => ev.type === "climb")).toBe(true);
  });

  it("sees an aircraft stop reporting (signal lost)", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 100 + 70 + 70);
    expect(e.openEvents().some((ev) => ev.hex === "7c0002" && ev.type === "signal_lost")).toBe(true);
  });

  it("evaluates detectors every poll interval of replay time, not every call", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 100);
    const before = e.evaluations;
    e.advanceTo(T0 + 101);
    e.advanceTo(T0 + 102);
    expect(e.evaluations).toBe(before);
    e.advanceTo(T0 + 100 + THRESHOLDS.poll.intervalMs / 1000);
    expect(e.evaluations).toBe(before + 1);
  });

  it("seeking backwards starts over and matches a fresh replay", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 500);
    e.seek(T0 + 60);
    const fresh = new ReplayEngine(recording(), THRESHOLDS);
    fresh.advanceTo(T0 + 60);
    expect(e.aircraft(0)).toEqual(fresh.aircraft(0));
    expect(e.openEvents().map((ev) => ev.type)).toEqual(fresh.openEvents().map((ev) => ev.type));
  });

  it("remembers ended events for the timeline", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 100 + 70 + 70); // 7c0002's climb has ended and its signal is lost
    e.advanceTo(T0 + 600);
    const ended = e.recentEvents("7c0002");
    expect(ended.length).toBeGreaterThan(0);
    expect(ended.every((ev) => ev.status === "closed" && ev.hex === "7c0002")).toBe(true);
    e.seek(T0 + 10);
    expect(e.recentEvents("7c0002")).toEqual([]);
  });

  it("gives identity and the recent track for the panel", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 30);
    expect(e.identity("7c0001")).toMatchObject({ registration: "VH-OQA", typeCode: "A388" });
    expect(e.track("7c0001").map((o) => o.t)).toEqual([T0, T0 + 7, T0 + 14, T0 + 21, T0 + 28]);
    expect(e.identity("nope")).toBeUndefined();
  });

  it("clamps the clock to the recording", () => {
    const e = new ReplayEngine(recording(), THRESHOLDS);
    e.advanceTo(T0 + 99_999);
    expect(e.clock).toBe(T0 + 600);
  });
});

describe("ReplayEngine on a real recording", () => {
  it("replays the late-night recording and sees the landing and take-off the live server saw", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseRecording } = await import("@aerotrack/shared");
    const rec = parseRecording(
      JSON.parse(readFileSync(new URL("../public/recordings/2026-10-17-late-night-landing-and-take-off-at-sydney-airport.json", import.meta.url), "utf8")),
    );
    const e = new ReplayEngine(rec, THRESHOLDS);
    const seen: { type: string; hex: string; seen: string }[] = [];
    for (let t = e.start; t <= e.end; t += 30) {
      for (const ev of e.advanceTo(t).opened) seen.push({ type: ev.type, hex: ev.hex, seen: ev.explanation.seen });
    }
    expect(seen).toContainEqual({
      type: "landing",
      hex: "7c01c1",
      seen: "This aircraft landed near Sydney Kingsford Smith International Airport at 11:52 pm.",
    });
    expect(seen).toContainEqual({
      type: "takeoff",
      hex: "7c3ecc",
      seen: "This aircraft took off near Sydney Kingsford Smith International Airport at 12:10 am.",
    });
  });
});

describe("ReplayEngine on the synthetic P1 fixture", () => {
  it("shows possible circling, a rapid descent and an emergency code, all in fixture mode", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseRecording } = await import("@aerotrack/shared");
    const rec = parseRecording(JSON.parse(readFileSync(new URL("../public/recordings/fixture-p1-detectors.json", import.meta.url), "utf8")));
    expect(rec.mode).toBe("fixture");
    const e = new ReplayEngine(rec, THRESHOLDS);
    const opened: { type: string; callsign: string | null; mode: string; confidence: string }[] = [];
    for (let t = e.start; t <= e.end; t += 10) {
      for (const ev of e.advanceTo(t).opened) {
        opened.push({ type: ev.type, callsign: e.identity(ev.hex)?.callsign ?? null, mode: ev.mode, confidence: ev.confidence });
      }
    }
    expect(opened).toContainEqual({ type: "circling", callsign: "TEST01", mode: "fixture", confidence: "possible" });
    expect(opened).toContainEqual({ type: "rapid_descent", callsign: "TEST02", mode: "fixture", confidence: "observed" });
    expect(opened).toContainEqual({ type: "emergency", callsign: "TEST03", mode: "fixture", confidence: "fact" });
  });
});
