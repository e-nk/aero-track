import type { RecordingFile } from "@aerotrack/shared";
import { describe, expect, it, vi } from "vitest";
import { recordedBadge } from "../lib/badge";
import { loadRecording, loadRecordingList } from "../lib/recordings";

const T0 = 1_792_200_000;
const rec: RecordingFile = {
  id: "r1",
  title: "Test",
  mode: "recorded",
  source: "ADSB.lol live capture",
  attribution: "Data: ADSB.lol (ODbL)",
  capturedFrom: T0,
  capturedTo: T0 + 600,
  bbox: [150, -35, 152, -33],
  reportedCause: null,
  aircraft: [],
};
const meta = { ...rec, aircraft: undefined, aircraftCount: 0 };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function routes(map: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (url: string | URL | Request) => {
    const handler = map[String(url)];
    if (!handler) throw new TypeError(`offline: ${String(url)}`);
    return handler();
  }) as unknown as typeof fetch;
}

describe("loading recordings", () => {
  it("lists from the api when it's reachable", async () => {
    const f = routes({ "http://localhost:8080/api/recordings": () => ok([meta]) });
    expect(await loadRecordingList({ fetch: f, offline: false })).toEqual({ source: "api", recordings: [meta] });
  });

  it("falls back to the offline copies when the api can't be reached", async () => {
    const f = routes({ "/recordings/index.json": () => ok([meta]) });
    expect(await loadRecordingList({ fetch: f, offline: false })).toEqual({ source: "offline", recordings: [meta] });
  });

  it("uses only the offline copies in offline mode", async () => {
    const f = routes({ "http://localhost:8080/api/recordings": () => ok([]), "/recordings/index.json": () => ok([meta]) });
    expect((await loadRecordingList({ fetch: f, offline: true })).source).toBe("offline");
  });

  it("loads and validates one recording, with the same fallback", async () => {
    const f = routes({ "/recordings/r1.json": () => ok(rec) });
    expect(await loadRecording("r1", { fetch: f, offline: false })).toEqual(rec);
  });

  it("returns null when a recording can't be found or isn't valid", async () => {
    expect(await loadRecording("r1", { fetch: routes({}), offline: false })).toBeNull();
    const bad = routes({ "http://localhost:8080/api/recordings/r1": () => ok({ ...rec, mode: "live" }) });
    expect(await loadRecording("r1", { fetch: bad, offline: false })).toBeNull();
  });
});

describe("recordedBadge", () => {
  it("names the replay time, speed and attribution", () => {
    expect(recordedBadge({ clock: T0 + 60, speed: 10, attribution: "Data: ADSB.lol (ODbL)", playing: true })).toEqual({
      tone: "live",
      text: "Recorded flight · 17 Oct 2026, 12:21 pm · 10x · Data: ADSB.lol (ODbL)",
    });
  });

  it("says when it's paused", () => {
    expect(recordedBadge({ clock: T0, speed: 1, attribution: "Data: ADSB.lol (ODbL)", playing: false }).text).toBe(
      "Recorded flight · 17 Oct 2026, 12:20 pm · paused · Data: ADSB.lol (ODbL)",
    );
  });
});
