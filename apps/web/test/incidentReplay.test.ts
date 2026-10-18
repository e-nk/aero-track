import { readFileSync } from "node:fs";
import { THRESHOLDS, parseRecording } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { alertsForChanges } from "../lib/alerts";
import { ReplayEngine } from "../lib/replay/engine";

// The archived incident (SPEC 14 phase 12): QFA520, 8 Nov 2024, ADSB.lol globe_history.
const rec = parseRecording(
  JSON.parse(readFileSync(new URL("../public/recordings/2024-11-08-return-to-sydney-soon-after-take-off.json", import.meta.url), "utf8")),
);

describe("archived incident replay", () => {
  it("is recorded data with the published account kept separate", () => {
    expect(rec.mode).toBe("recorded");
    expect(rec.reportedCause?.sourceUrl).toBe("https://www.atsb.gov.au/investigations/ao-2024-057");
    expect(rec.aircraft.map((a) => [a.callsign, a.registration])).toEqual([["QFA520", "VH-VYH"]]);
  });

  it("shows what the data shows: take-off, a holding pattern, landing, and no emergency code", () => {
    const e = new ReplayEngine(rec, THRESHOLDS);
    const opened: string[] = [];
    for (let t = e.start; t <= e.end; t += 10) for (const ev of e.advanceTo(t).opened) opened.push(ev.type);
    process.stderr.write(`EVENTS ${opened.join(", ")}\n`);
    expect(opened).toContain("takeoff");
    expect(opened).toContain("circling");
    expect(opened).toContain("landing");
    expect(opened).not.toContain("emergency"); // squawk stayed 1345; the PAN PAN call was by radio
    expect(opened.indexOf("takeoff")).toBeLessThan(opened.indexOf("circling"));
    expect(opened.indexOf("circling")).toBeLessThan(opened.indexOf("landing"));
  });
});

describe("alerts on the archived incident", () => {
  it("watching QFA520 gives took off, circling and landed, in that order, all recorded", () => {
    const e = new ReplayEngine(rec, THRESHOLDS);
    const kinds: string[] = [];
    const bodies: string[] = [];
    for (let t = e.start; t <= e.end; t += 10) {
      const changes = e.advanceTo(t);
      for (const a of alertsForChanges({
        opened: changes.opened,
        closed: changes.closed,
        watched: new Set(["7c6db7"]),
        since: () => e.start - THRESHOLDS.alerts.backfillSec,
        identity: (hex) => e.identity(hex),
        position: (hex) => e.track(hex).at(-1),
        mode: rec.mode,
      })) {
        expect(a.mode).toBe("recorded");
        kinds.push(a.kind);
        bodies.push(a.body);
      }
    }
    expect(kinds).toEqual(["takeoff", "circling", "landing"]);
    expect(bodies[1]).toMatch(/^QFA520 has been circling about \d+ km south(-east|-west)? of Sydney Kingsford Smith International Airport for about/);
  });
});
