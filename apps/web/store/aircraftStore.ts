import { NO_FILTERS, type Filters } from "../lib/filters";
import type { LifecycleChanges } from "@aerotrack/detectors";
import { THRESHOLDS } from "@aerotrack/shared";
import { alertsForChanges, appendAlerts, type Alert } from "../lib/alerts";
import { createWatchlist } from "../lib/watchlist";
import type { BehaviourEvent, Observation, RecordingFile } from "@aerotrack/shared";
import { create } from "zustand";
import type { AircraftDetail } from "../lib/api";
import {
  applyEventClose,
  applyEventUpsert,
  applyEventsSeed,
  applyFollows,
  applyOverview,
  applySnapshot,
  applyStatus,
  initialLiveState,
  type LiveAircraft,
  type LiveState,
} from "../lib/liveState";
import type { LiveHandlers } from "../lib/sse";

export interface Selection {
  status: "loading" | "ready" | "not_found" | "error";
  detail: AircraftDetail | null;
  segments: Observation[][];
}

const EMPTY_SELECTION: Selection = { status: "loading", detail: null, segments: [] };

export interface ReplayInfo {
  id: string;
  title: string;
  start: number;
  end: number;
  clock: number;
  speed: number;
  playing: boolean;
  attribution: string;
  reportedCause: RecordingFile["reportedCause"];
  mode: RecordingFile["mode"];
}

// The live watch list is remembered in browser storage (Task 2 of the alerts plan).
const watchlist = createWatchlist();
const nowSec = () => Date.now() / 1000;

/** How replay alerts look up a flight's name and position (from the ReplayEngine). */
export interface ReplayLookup {
  identity: (hex: string) => { callsign: string | null; registration: string | null } | undefined;
  position: (hex: string) => { lat: number; lon: number } | undefined;
}

interface AircraftStore extends LiveState {
  mode: "live" | "recorded";
  /** Recorded mode only: the recording being replayed and its controls. */
  replay: ReplayInfo | null;
  /** Clear everything and enter recorded mode (modes never mix, SPEC 12.1). */
  startRecorded: (info: ReplayInfo) => void;
  /** One replay frame: aircraft and open events at the replay clock. */
  setReplayFrame: (clock: number, aircraft: LiveAircraft[], events: BehaviourEvent[]) => void;
  setReplayControls: (patch: Partial<Pick<ReplayInfo, "speed" | "playing">>) => void;
  handlers: LiveHandlers;
  selectedHex: string | null;
  selection: Selection;
  select: (hex: string | null) => void;
  /** Select an aircraft and ask the map to fly to it (e.g. from the Following list). */
  focus: { hex: string; at: number } | null;
  focusOn: (hex: string) => void;
  /** Map filters (SPEC 12.6). Not persisted; cleared when the mode changes. */
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  setSelection: (hex: string, patch: Partial<Selection>) => void;
  seedEvents: (detail: AircraftDetail) => void;
  /** Alerts for watched flights (alerts design spec), newest first, this visit only. */
  alerts: Alert[];
  unreadAlerts: number;
  /** Live: flights this browser watches (persisted). */
  watched: string[];
  /** Recorded: flights watched in this replay (memory only). */
  replayWatch: string[];
  /** When each flight was watched (epoch seconds; replay clock in recorded mode). */
  watchSince: Record<string, number>;
  /** Page load or last mode switch (epoch seconds). Older events never alert. */
  alertsSince: number;
  /** False when the watch list is full. */
  watch: (hex: string, nowSec: number) => boolean;
  unwatch: (hex: string) => void;
  markAlertsRead: () => void;
  /** Read the remembered watch list (client only, after mount: the server render has none). */
  loadWatchlist: () => void;
  /** Recorded mode: alerts for one replay step's lifecycle changes. */
  applyReplayChanges: (changes: LifecycleChanges, lookup: ReplayLookup) => void;
  /** Recorded mode: forget alerts when seeking back to `toClock`; watches count from no later than there. */
  resetReplayAlerts: (toClock?: number) => void;
  reset: () => void;
}

const EMPTY_ALERTS = { alerts: [] as Alert[], unreadAlerts: 0, replayWatch: [] as string[], watchSince: {} as Record<string, number> };

/** Live alert step: run the pure function against the current store and merge the result. */
function liveAlerts(s: AircraftStore, opened: BehaviourEvent[], closed: BehaviourEvent[]): Partial<AircraftStore> {
  if (s.mode !== "live" || !s.watched.length) return {};
  const fresh = alertsForChanges({
    opened,
    closed,
    watched: new Set(s.watched),
    since: (hex) => Math.max(s.alertsSince, s.watchSince[hex] ?? 0) - THRESHOLDS.alerts.backfillSec,
    identity: (hex) => ({ callsign: s.aircraft[hex]?.callsign ?? s.overview?.aircraft[hex]?.callsign ?? null, registration: null }),
    position: (hex) => s.aircraft[hex] ?? s.overview?.aircraft[hex],
    mode: "live",
  });
  const { alerts, added } = appendAlerts(s.alerts, fresh);
  return added ? { alerts, unreadAlerts: s.unreadAlerts + added } : {};
}

export const useAircraftStore = create<AircraftStore>()((set) => ({
  ...initialLiveState,
  mode: "live",
  replay: null,
  startRecorded: (info) =>
    set({ ...initialLiveState, mode: "recorded", replay: info, selectedHex: null, selection: EMPTY_SELECTION, focus: null, filters: NO_FILTERS, ...EMPTY_ALERTS, alertsSince: nowSec() }),
  setReplayFrame: (clock, aircraft, events) =>
    set((s) => ({
      replay: s.replay && { ...s.replay, clock },
      aircraft: Object.fromEntries(aircraft.map((a) => [a.hex, a])),
      events: Object.fromEntries(events.map((e) => [e.id, e])),
    })),
  setReplayControls: (patch) => set((s) => ({ replay: s.replay && { ...s.replay, ...patch } })),
  handlers: {
    onConnection: (connection) => set({ connection }),
    onSnapshot: (data) => set((s) => applySnapshot(s, data, Date.now())),
    onStatus: (data) => set((s) => applyStatus(s, data)),
    onEventUpsert: (e) => set((s) => applyEventUpsert(s, e)),
    onEventOpen: (e) => set((s) => ({ ...applyEventUpsert(s, e), ...liveAlerts(s, [e], []) })),
    onEventClose: (data) =>
      set((s) => {
        const known = s.events[data.id];
        const closed = known ? [{ ...known, status: "closed" as const, closedAt: data.closedAt }] : [];
        return { ...applyEventClose(s, data), ...liveAlerts(s, [], closed) };
      }),
    onOverview: (data) => set((s) => applyOverview(s, data, Date.now())),
    onFollows: (data) =>
      set((s) => {
        const next = applyFollows(s, data);
        if (s.mode !== "live") return next;
        // Live watching always follows, so a watch whose follow is gone (landed and expired,
        // 24 h old, or removed by someone) is stale: drop it.
        const followed = new Set(data.follows.map((f) => f.hex));
        const stale = s.watched.filter((h) => !followed.has(h));
        for (const hex of stale) watchlist.remove(hex);
        return stale.length ? { ...next, watched: watchlist.list() } : next;
      }),
  },
  selectedHex: null,
  selection: EMPTY_SELECTION,
  select: (hex) => set({ selectedHex: hex, selection: EMPTY_SELECTION }),
  focus: null,
  focusOn: (hex) => set({ selectedHex: hex, selection: EMPTY_SELECTION, focus: { hex, at: Date.now() } }),
  filters: NO_FILTERS,
  ...EMPTY_ALERTS,
  watched: [],
  alertsSince: nowSec(),
  loadWatchlist: () => set({ watched: watchlist.list() }),
  watch: (hex, now) => {
    const s = useAircraftStore.getState();
    if (s.mode === "recorded") {
      if (!s.replayWatch.includes(hex)) set({ replayWatch: [...s.replayWatch, hex], watchSince: { ...s.watchSince, [hex]: s.replay?.clock ?? now } });
      return true;
    }
    if (!watchlist.add(hex)) return false;
    set({ watched: watchlist.list(), watchSince: { ...s.watchSince, [hex]: now } });
    return true;
  },
  unwatch: (hex) =>
    set((s) => {
      if (s.mode === "recorded") return { replayWatch: s.replayWatch.filter((h) => h !== hex) };
      watchlist.remove(hex);
      return { watched: watchlist.list() };
    }),
  markAlertsRead: () => set({ unreadAlerts: 0 }),
  applyReplayChanges: (changes, lookup) =>
    set((s) => {
      if (s.mode !== "recorded" || !s.replay || !s.replayWatch.length) return {};
      const replay = s.replay;
      const fresh = alertsForChanges({
        opened: changes.opened,
        closed: changes.closed,
        watched: new Set(s.replayWatch),
        since: (hex) => (s.watchSince[hex] ?? replay.start) - THRESHOLDS.alerts.backfillSec,
        identity: lookup.identity,
        position: lookup.position,
        mode: replay.mode,
      });
      const { alerts, added } = appendAlerts(s.alerts, fresh);
      return added ? { alerts, unreadAlerts: s.unreadAlerts + added } : {};
    }),
  resetReplayAlerts: (toClock) =>
    set((s) => {
      // A rewind means "show me again": count watches from no later than the new position.
      const watchSince = { ...s.watchSince };
      if (toClock !== undefined) for (const hex of s.replayWatch) watchSince[hex] = Math.min(watchSince[hex] ?? toClock, toClock);
      return { alerts: [], unreadAlerts: 0, watchSince };
    }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  // Ignore late responses for an aircraft that is no longer selected.
  setSelection: (hex, patch) =>
    set((s) => (s.selectedHex === hex ? { selection: { ...s.selection, ...patch } } : {})),
  seedEvents: (detail) => set((s) => applyEventsSeed(s, detail.state.hex, detail.openEvents)),
  // Switching mode clears the map and store (SPEC 12.1).
  reset: () =>
    set({
      ...initialLiveState,
      mode: "live",
      replay: null,
      selectedHex: null,
      selection: EMPTY_SELECTION,
      focus: null,
      filters: NO_FILTERS,
      ...EMPTY_ALERTS,
      alertsSince: nowSec(),
      watched: watchlist.list(),
    }),
}));
