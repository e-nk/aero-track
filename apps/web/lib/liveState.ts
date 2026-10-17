import {
  fromCompact,
  type BehaviourEvent,
  type CompactAircraft,
  type DataMode,
  type DecodedAircraft,
  type FeedStatus,
} from "@aerotrack/shared";

// Pure state transitions for live mode. The Zustand store wraps these.

export interface LiveAircraft extends DecodedAircraft {
  receivedAtMs: number; // browser clock when the snapshot arrived
  serverNow: number; // server (provider) clock of that snapshot, epoch seconds
}

export type Connection = "connecting" | "open" | "reconnecting";

export interface LiveState {
  connection: Connection;
  feedStatus: FeedStatus | null;
  lastPollAt: number | null;
  lastSnapshotAt: number | null; // browser ms
  serverNow: number | null;
  aircraft: Record<string, LiveAircraft>;
  events: Record<string, BehaviourEvent>;
}

export const initialLiveState: LiveState = {
  connection: "connecting",
  feedStatus: null,
  lastPollAt: null,
  lastSnapshotAt: null,
  serverNow: null,
  aircraft: {},
  events: {},
};

export interface SnapshotData {
  now: number;
  mode: DataMode;
  feedStatus: FeedStatus;
  aircraft: CompactAircraft[];
}

export function applySnapshot(s: LiveState, data: SnapshotData, receivedAtMs: number): LiveState {
  if (data.mode !== "live") return s; // never mix modes in one view
  const aircraft: Record<string, LiveAircraft> = {};
  for (const c of data.aircraft) {
    const a = fromCompact(c);
    aircraft[a.hex] = { ...a, receivedAtMs, serverNow: data.now };
  }
  return { ...s, aircraft, feedStatus: data.feedStatus, serverNow: data.now, lastSnapshotAt: receivedAtMs };
}

export function applyStatus(s: LiveState, data: { feedStatus: FeedStatus; lastPollAt: number | null }): LiveState {
  return { ...s, feedStatus: data.feedStatus, lastPollAt: data.lastPollAt };
}

export function applyEventUpsert(s: LiveState, e: BehaviourEvent): LiveState {
  if (e.mode !== "live") return s;
  return { ...s, events: { ...s.events, [e.id]: e } };
}

export function applyEventClose(s: LiveState, data: { id: string; hex: string; closedAt: number | null }): LiveState {
  if (!(data.id in s.events)) return s;
  const events = { ...s.events };
  delete events[data.id];
  return { ...s, events };
}
