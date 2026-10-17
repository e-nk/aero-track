import { create } from "zustand";
import {
  applyEventClose,
  applyEventUpsert,
  applySnapshot,
  applyStatus,
  initialLiveState,
  type LiveState,
} from "../lib/liveState";
import type { LiveHandlers } from "../lib/sse";

interface AircraftStore extends LiveState {
  mode: "live" | "recorded";
  handlers: LiveHandlers;
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
  },
  // Switching mode clears the map and store (SPEC 12.1).
  reset: () => set({ ...initialLiveState }),
}));
