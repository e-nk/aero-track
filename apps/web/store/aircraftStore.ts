import type { Observation } from "@aerotrack/shared";
import { create } from "zustand";
import type { AircraftDetail } from "../lib/api";
import {
  applyEventClose,
  applyEventUpsert,
  applyEventsSeed,
  applyOverview,
  applySnapshot,
  applyStatus,
  initialLiveState,
  type LiveState,
} from "../lib/liveState";
import type { LiveHandlers } from "../lib/sse";

export interface Selection {
  status: "loading" | "ready" | "not_found" | "error";
  detail: AircraftDetail | null;
  segments: Observation[][];
}

const EMPTY_SELECTION: Selection = { status: "loading", detail: null, segments: [] };

interface AircraftStore extends LiveState {
  mode: "live" | "recorded";
  handlers: LiveHandlers;
  selectedHex: string | null;
  selection: Selection;
  select: (hex: string | null) => void;
  setSelection: (hex: string, patch: Partial<Selection>) => void;
  seedEvents: (detail: AircraftDetail) => void;
  reset: () => void;
}

export const useAircraftStore = create<AircraftStore>()((set) => ({
  ...initialLiveState,
  mode: "live",
  handlers: {
    onConnection: (connection) => set({ connection }),
    onSnapshot: (data) => set((s) => applySnapshot(s, data, Date.now())),
    onStatus: (data) => set((s) => applyStatus(s, data)),
    onEventUpsert: (e) => set((s) => applyEventUpsert(s, e)),
    onEventClose: (data) => set((s) => applyEventClose(s, data)),
    onOverview: (data) => set((s) => applyOverview(s, data, Date.now())),
  },
  selectedHex: null,
  selection: EMPTY_SELECTION,
  select: (hex) => set({ selectedHex: hex, selection: EMPTY_SELECTION }),
  // Ignore late responses for an aircraft that is no longer selected.
  setSelection: (hex, patch) =>
    set((s) => (s.selectedHex === hex ? { selection: { ...s.selection, ...patch } } : {})),
  seedEvents: (detail) => set((s) => applyEventsSeed(s, detail.state.hex, detail.openEvents)),
  // Switching mode clears the map and store (SPEC 12.1).
  reset: () => set({ ...initialLiveState, selectedHex: null, selection: EMPTY_SELECTION }),
}));
