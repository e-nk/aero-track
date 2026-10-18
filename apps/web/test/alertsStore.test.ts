import type { BehaviourEvent } from "@aerotrack/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { useAircraftStore } from "../store/aircraftStore";

const NOW = 1_792_300_000;
const landing = (id: string, openedAt: number, hex = "7c6db7"): BehaviourEvent => ({
  id,
  hex,
  type: "landing",
  confidence: "fact",
  windowStart: openedAt,
  windowEnd: openedAt,
  evidence: { at: openedAt },
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt,
  updatedAt: openedAt,
  closedAt: null,
});

beforeEach(() => {
  const s = useAircraftStore.getState();
  s.reset();
  for (const hex of s.watched) s.unwatch(hex);
  useAircraftStore.setState({ alertsSince: NOW - 3600 });
});

describe("live alerts", () => {
  it("alerts once for a watched flight's new event, even if the message arrives twice", () => {
    const s = useAircraftStore.getState();
    expect(s.watch("7c6db7", NOW - 60)).toBe(true);
    s.handlers.onEventOpen(landing("e1", NOW));
    s.handlers.onEventOpen(landing("e1", NOW));
    const { alerts, unreadAlerts } = useAircraftStore.getState();
    expect(alerts.map((a) => [a.kind, a.mode])).toEqual([["landing", "live"]]);
    expect(unreadAlerts).toBe(1);
  });

  it("does not alert for flights that aren't watched, or for updates", () => {
    const s = useAircraftStore.getState();
    s.handlers.onEventOpen(landing("e2", NOW, "7c0001"));
    s.watch("7c6db7", NOW - 60);
    s.handlers.onEventUpsert(landing("e3", NOW));
    expect(useAircraftStore.getState().alerts).toEqual([]);
  });

  it("does not replay old events after a reload (backfill window from page load)", () => {
    useAircraftStore.getState().watch("7c6db7", NOW - 86_400); // watched yesterday, remembered
    useAircraftStore.setState({ alertsSince: NOW, watchSince: {} }); // page just loaded
    useAircraftStore.getState().handlers.onEventOpen(landing("old", NOW - 600));
    useAircraftStore.getState().handlers.onEventOpen(landing("new", NOW + 5));
    expect(useAircraftStore.getState().alerts.map((a) => a.eventId)).toEqual(["new"]);
  });

  it("says 'tracking again' when a watched flight's signal-lost event closes", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW - 60);
    s.handlers.onEventOpen({ ...landing("lost", NOW), type: "signal_lost", evidence: { secondsSinceLastPosition: 300 } });
    s.handlers.onEventClose({ id: "lost", hex: "7c6db7", closedAt: NOW + 120 });
    expect(useAircraftStore.getState().alerts.map((a) => a.kind)).toEqual(["signal_back", "signal_lost"]);
  });

  it("never alerts for events loaded with the details (opened before we looked)", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW - 60);
    s.seedEvents({ state: { hex: "7c6db7" }, history: "ok", openEvents: [landing("seeded", NOW)], recentEvents: [] } as unknown as Parameters<typeof s.seedEvents>[0]);
    expect(useAircraftStore.getState().alerts).toEqual([]);
  });

  it("unwatching stops alerts; markAlertsRead clears the count", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW - 60);
    s.handlers.onEventOpen(landing("e4", NOW));
    s.markAlertsRead();
    s.unwatch("7c6db7");
    s.handlers.onEventOpen(landing("e5", NOW));
    expect(useAircraftStore.getState()).toMatchObject({ unreadAlerts: 0, watched: [] });
    expect(useAircraftStore.getState().alerts).toHaveLength(1);
  });
});

describe("replay alerts", () => {
  const replayInfo = { id: "r", title: "t", start: NOW, end: NOW + 600, clock: NOW, speed: 10, playing: true, attribution: "a", reportedCause: null, mode: "recorded" as const };
  const lookup = { identity: () => ({ callsign: "QFA520", registration: null }), position: () => undefined };

  it("alerts for flights watched in the replay, and clears them when leaving", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW); // live watch
    s.startRecorded(replayInfo);
    useAircraftStore.getState().watch("7c6db7", 0); // replay watch at replay clock NOW
    useAircraftStore.getState().applyReplayChanges({ opened: [{ ...landing("r1", NOW + 30), mode: "recorded" }], updated: [], closed: [] }, lookup);
    expect(useAircraftStore.getState().alerts.map((a) => [a.kind, a.mode])).toEqual([["landing", "recorded"]]);

    useAircraftStore.getState().reset(); // back to live
    expect(useAircraftStore.getState()).toMatchObject({ alerts: [], replayWatch: [], watched: ["7c6db7"] });
  });

  it("resetReplayAlerts empties the list (used when seeking backwards)", () => {
    useAircraftStore.getState().startRecorded(replayInfo);
    useAircraftStore.getState().watch("7c6db7", 0);
    useAircraftStore.getState().applyReplayChanges({ opened: [{ ...landing("r2", NOW + 30), mode: "recorded" }], updated: [], closed: [] }, lookup);
    useAircraftStore.getState().resetReplayAlerts();
    expect(useAircraftStore.getState()).toMatchObject({ alerts: [], unreadAlerts: 0, replayWatch: ["7c6db7"] });
  });
});

describe("review fixes (store)", () => {
  it("loads the remembered watch list on demand, so the server and first client render agree", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW);
    useAircraftStore.setState({ watched: [] });
    useAircraftStore.getState().loadWatchlist();
    expect(useAircraftStore.getState().watched).toEqual(["7c6db7"]);
  });

  it("drops watches whose follow the server no longer has", () => {
    const s = useAircraftStore.getState();
    s.watch("aaaaaa", NOW);
    s.watch("bbbbbb", NOW);
    s.handlers.onFollows({ max: 10, follows: [{ hex: "bbbbbb", addedAt: NOW, landedAt: null }] });
    expect(useAircraftStore.getState().watched).toEqual(["bbbbbb"]);
  });

  it("rewinding before the watch time still shows the alerts again", () => {
    const info = { id: "r", title: "t", start: NOW, end: NOW + 600, clock: NOW + 500, speed: 10, playing: true, attribution: "a", reportedCause: null, mode: "recorded" as const };
    useAircraftStore.getState().startRecorded(info);
    useAircraftStore.getState().watch("7c6db7", 0); // watched at replay clock NOW+500
    useAircraftStore.getState().resetReplayAlerts(NOW);
    useAircraftStore.getState().applyReplayChanges(
      { opened: [{ ...landing("rw", NOW + 30), mode: "recorded" }], updated: [], closed: [] },
      { identity: () => undefined, position: () => undefined },
    );
    expect(useAircraftStore.getState().alerts.map((a) => a.eventId)).toEqual(["rw"]);
  });
});
