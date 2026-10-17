import type { EventLifecycle, LifecycleChanges } from "@aerotrack/detectors";
import { toCompact, type BehaviourEvent, type CompactAircraft, type DataMode, type FeedStatus } from "@aerotrack/shared";
import type { AircraftStore } from "./buffer";
import type { PollerStatus } from "./poller";

// Payloads for /api/stream (SPEC 11.8). Each message is [event name, data].

export interface SnapshotData {
  now: number;
  mode: DataMode;
  feedStatus: FeedStatus;
  aircraft: CompactAircraft[];
}

export type StreamMessage =
  | ["snapshot", SnapshotData]
  | ["status", { feedStatus: FeedStatus; lastPollAt: number | null }]
  | ["event_open" | "event_update", BehaviourEvent]
  | ["event_close", { id: string; hex: string; closedAt: number | null }];

export function snapshotMessage(args: {
  store: AircraftStore;
  lifecycle: EventLifecycle;
  feedStatus: FeedStatus;
  now: number;
}): ["snapshot", SnapshotData] {
  const withEvents = new Set(args.lifecycle.openEvents().map((e) => e.hex));
  return [
    "snapshot",
    {
      now: args.now,
      mode: "live",
      feedStatus: args.feedStatus,
      aircraft: args.store.all().map((s) => toCompact(s, withEvents.has(s.hex))),
    },
  ];
}

export function statusMessage({ feedStatus, lastPollAt }: PollerStatus): StreamMessage {
  return ["status", { feedStatus, lastPollAt }];
}

export function changeMessages(changes: LifecycleChanges): StreamMessage[] {
  return [
    ...changes.opened.map((e): StreamMessage => ["event_open", e]),
    ...changes.updated.map((e): StreamMessage => ["event_update", e]),
    ...changes.closed.map((e): StreamMessage => ["event_close", { id: e.id, hex: e.hex, closedAt: e.closedAt }]),
  ];
}
