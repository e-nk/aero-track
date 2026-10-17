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
  setSelection: (hex: string, patch: Partial<Selection>) => void;
  seedEvents: (detail: AircraftDetail) => void;
  reset: () => void;
}

export const useAircraftStore = create<AircraftStore>()((set) => ({
  ...initialLiveState,
  mode: "live",
  replay: null,
  startRecorded: (info) =>
    set({ ...initialLiveState, mode: "recorded", replay: info, selectedHex: null, selection: EMPTY_SELECTION, focus: null }),
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
    onEventClose: (data) => set((s) => applyEventClose(s, data)),
    onOverview: (data) => set((s) => applyOverview(s, data, Date.now())),
    onFollows: (data) => set((s) => applyFollows(s, data)),
  },
  selectedHex: null,
  selection: EMPTY_SELECTION,
  select: (hex) => set({ selectedHex: hex, selection: EMPTY_SELECTION }),
  focus: null,
  focusOn: (hex) => set({ selectedHex: hex, selection: EMPTY_SELECTION, focus: { hex, at: Date.now() } }),
  // Ignore late responses for an aircraft that is no longer selected.
  setSelection: (hex, patch) =>
    set((s) => (s.selectedHex === hex ? { selection: { ...s.selection, ...patch } } : {})),
  seedEvents: (detail) => set((s) => applyEventsSeed(s, detail.state.hex, detail.openEvents)),
  // Switching mode clears the map and store (SPEC 12.1).
  reset: () => set({ ...initialLiveState, mode: "live", replay: null, selectedHex: null, selection: EMPTY_SELECTION, focus: null }),
}));
