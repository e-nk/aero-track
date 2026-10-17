import { THRESHOLDS, fromCompact, type CompactAircraft } from "@aerotrack/shared";
import { describe, expect, it, vi } from "vitest";
import { buildAircraftFeatures } from "../lib/aircraftFeatures";
import { followFlight, unfollowFlight } from "../lib/api";
import { applyFollows, initialLiveState } from "../lib/liveState";

describe("applyFollows", () => {
  it("stores the shared follow list", () => {
    const s = applyFollows(initialLiveState, { max: 10, follows: [{ hex: "71bf75", addedAt: 1, landedAt: null }] });
    expect(s.follows).toEqual({ max: 10, follows: [{ hex: "71bf75", addedAt: 1, landedAt: null }] });
  });
});

describe("followed aircraft on the map", () => {
  it("marks followed aircraft so their label shows at every zoom", () => {
    const c: CompactAircraft = ["71bf75", "AAR602", -23, 147, 34000, 480, 358, 0, "B772", "A5", 1000, false, false, 35650];
    const fc = buildAircraftFeatures([{ ...fromCompact(c), receivedAtMs: 0, serverNow: 1000 }], 0, THRESHOLDS.display, new Set(["71bf75"]));
    expect(fc.features[0]!.properties.followed).toBe(true);
    expect(buildAircraftFeatures([{ ...fromCompact(c), receivedAtMs: 0, serverNow: 1000 }], 0, THRESHOLDS.display).features[0]!.properties.followed).toBe(false);
  });
});

describe("follow API calls", () => {
  const respond = (status: number, body?: unknown) =>
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("follows and unfollows", async () => {
    const f = respond(201, { result: "added", max: 10, follows: [] });
    expect(await followFlight("71bf75", f)).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith("http://localhost:8080/api/follows/71bf75", { method: "POST" });
    expect(await unfollowFlight("71bf75", respond(204))).toEqual({ ok: true });
  });

  it("passes on the server's plain message when following is full", async () => {
    const full = respond(409, { error: "full", message: "Following is full right now (10 flights). Try again later." });
    expect(await followFlight("71bf75", full)).toEqual({ ok: false, message: "Following is full right now (10 flights). Try again later." });
  });

  it("says something calm when the server can't be reached", async () => {
    const down = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await followFlight("71bf75", down)).toEqual({ ok: false, message: "Couldn't reach AeroTrack. Please try again." });
  });
});
