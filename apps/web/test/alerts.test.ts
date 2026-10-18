import type { BehaviourEvent, EventType } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { alertsForChanges, appendAlerts, placePhrase, shouldAnnounce, type Alert, type AlertInput } from "../lib/alerts";

const T = 1_731_029_700; // 8 Nov 2024, 12:35 pm in Sydney
const SYD = { lat: -33.946, lon: 151.177 }; // Sydney Kingsford Smith

const ev = (type: EventType, evidence: BehaviourEvent["evidence"], over: Partial<BehaviourEvent> = {}): BehaviourEvent => ({
  id: `e-${type}`,
  hex: "7c6db7",
  type,
  confidence: "observed",
  windowStart: T,
  windowEnd: T,
  evidence,
  mode: "recorded",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: T,
  updatedAt: T,
  closedAt: null,
  ...over,
});

const input = (over: Partial<AlertInput> = {}): AlertInput => ({
  opened: [],
  closed: [],
  watched: new Set(["7c6db7"]),
  since: () => T - 120,
  identity: () => ({ callsign: "QFA520", registration: "VH-VYH" }),
  position: () => undefined,
  mode: "recorded",
  ...over,
});

const one = (over: Partial<AlertInput>) => {
  const out = alertsForChanges(input(over));
  expect(out).toHaveLength(1);
  return out[0]!;
};

describe("alert wording", () => {
  it("took off, near a known airport", () => {
    const a = one({ opened: [ev("takeoff", { at: T, airportName: "Sydney Kingsford Smith International Airport", airportKm: 1.2 })] });
    expect(a).toMatchObject({ kind: "takeoff", title: "QFA520 took off", body: "QFA520 took off near Sydney Kingsford Smith International Airport at 12:35 pm.", at: T, mode: "recorded" });
  });

  it("landed, away from known airports", () => {
    const a = one({ opened: [ev("landing", { at: T })] });
    expect(a.body).toBe("QFA520 landed at 12:35 pm, away from the airports we know about.");
  });

  it("circling, with a place only near a known airport", () => {
    const evidence = { totalDeg: 540, spanSec: 360, altSpreadFt: 0 };
    const near = one({ opened: [ev("circling", evidence)], position: () => ({ lat: SYD.lat - 0.225, lon: SYD.lon }) });
    expect(near.title).toBe("QFA520 is circling");
    expect(near.body).toBe(
      "QFA520 has been circling about 25 km south of Sydney Kingsford Smith International Airport for about 6 minutes. Aircraft commonly do this while waiting to land. The data doesn't show why.",
    );
    const far = one({ opened: [ev("circling", evidence)], position: () => ({ lat: -36.5, lon: 151.2 }) });
    expect(far.body).toBe("QFA520 has been circling for about 6 minutes. Aircraft commonly do this while waiting to land. The data doesn't show why.");
  });

  it("signal lost, then tracking again", () => {
    const lost = ev("signal_lost", { secondsSinceLastPosition: 300 });
    expect(one({ opened: [lost] })).toMatchObject({
      kind: "signal_lost",
      title: "No new position for QFA520",
      body: "We haven't had a position for QFA520 for 5 minutes. This is common over the ocean, where there are few receivers.",
    });
    const back = one({ closed: [{ ...lost, status: "closed", closedAt: T + 400 }] });
    expect(back).toMatchObject({ kind: "signal_back", title: "Tracking QFA520 again", body: "New positions for QFA520 are arriving again.", at: T + 400 });
  });

  it("emergency code", () => {
    expect(one({ opened: [ev("emergency", { squawk: "7700" })] })).toMatchObject({
      title: "QFA520 is transmitting an emergency code",
      body: "Crews use these codes to get priority help, and many such flights land normally. The data doesn't show why. Check with the airline for official information.",
    });
  });

  it("rapid descent, and Not available when the rate is missing", () => {
    expect(one({ opened: [ev("rapid_descent", { peakRateFpm: -5240 })] }).body).toBe(
      "About 5,200 ft per minute. The data doesn't show why. Check with the airline for official information.",
    );
    expect(one({ opened: [ev("rapid_descent", {})] }).body).toBe(
      "About Not available ft per minute. The data doesn't show why. Check with the airline for official information.",
    );
  });

  it("names the flight by callsign, then registration, then hex", () => {
    const opened = [ev("landing", { at: T })];
    expect(one({ opened, identity: () => ({ callsign: null, registration: "VH-VYH" }) }).title).toBe("VH-VYH landed");
    expect(one({ opened, identity: () => undefined }).title).toBe("7c6db7 landed");
  });
});

describe("alert filtering", () => {
  it("ignores flights that aren't watched", () => {
    expect(alertsForChanges(input({ opened: [ev("landing", { at: T })], watched: new Set() }))).toEqual([]);
  });

  it("ignores events that opened before the backfill window", () => {
    expect(alertsForChanges(input({ opened: [ev("landing", { at: T })], since: () => T + 1 }))).toEqual([]);
  });

  it("ignores kinds that aren't alerts (climb, descent, turn, gap, glitch)", () => {
    const types: EventType[] = ["climb", "descent", "turn", "gap", "glitch"];
    expect(alertsForChanges(input({ opened: types.map((t) => ev(t, {})) }))).toEqual([]);
  });

  it("only says 'tracking again' for a signal loss it would have alerted", () => {
    const old = ev("signal_lost", {}, { openedAt: T - 1000, status: "closed", closedAt: T });
    expect(alertsForChanges(input({ closed: [old] }))).toEqual([]);
    expect(alertsForChanges(input({ closed: [ev("landing", {}, { status: "closed", closedAt: T })] }))).toEqual([]);
  });

  it("gives stable, distinct ids for open and close", () => {
    const lost = ev("signal_lost", {});
    const [open] = alertsForChanges(input({ opened: [lost] }));
    const [close] = alertsForChanges(input({ closed: [{ ...lost, status: "closed", closedAt: T + 60 }] }));
    expect([open!.id, close!.id]).toEqual(["e-signal_lost:open", "e-signal_lost:close"]);
  });
});

describe("placePhrase", () => {
  it("says 'near' when within 3 km, nothing when outside the limit or unknown", () => {
    expect(placePhrase(SYD)).toBe("near Sydney Kingsford Smith International Airport ");
    expect(placePhrase({ lat: -36.5, lon: 151.2 })).toBe("");
    expect(placePhrase(undefined)).toBe("");
  });
});

describe("appendAlerts", () => {
  const a = (id: string, at: number): Alert => ({ id, eventId: id, hex: "x", kind: "landing", title: id, body: "", at, mode: "live" });

  it("adds new alerts newest first and ignores duplicates", () => {
    const first = appendAlerts([], [a("1", 10)]);
    const second = appendAlerts(first.alerts, [a("1", 10), a("2", 20)]);
    expect(second.added).toBe(1);
    expect(second.alerts.map((x) => x.id)).toEqual(["2", "1"]);
  });

  it("keeps at most 50", () => {
    const many = Array.from({ length: 60 }, (_, i) => a(String(i), i));
    expect(appendAlerts([], many).alerts).toHaveLength(50);
  });
});

describe("review fixes", () => {
  it("dates take-off and landing alerts by the touchdown or lift-off time, not the confirmation time", () => {
    const a = one({ opened: [ev("landing", { at: T - 50 }, { openedAt: T })] });
    expect(a.at).toBe(T - 50);
    expect(a.body).toContain("at 12:34 pm");
  });

  it("announces a replay alert only when it happened near the replay clock (no bursts when seeking)", () => {
    const rec = { id: "x", eventId: "x", hex: "h", kind: "landing" as const, title: "t", body: "b", at: T, mode: "recorded" as const };
    expect(shouldAnnounce(rec, T + 30)).toBe(true);
    expect(shouldAnnounce(rec, T + 3600)).toBe(false);
    expect(shouldAnnounce({ ...rec, mode: "live" }, null)).toBe(true);
  });
});
