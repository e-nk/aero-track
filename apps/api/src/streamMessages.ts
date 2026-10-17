import type { EventLifecycle, LifecycleChanges } from "@aerotrack/detectors";
import {
  toCompact,
  toOverviewCompact,
  type BehaviourEvent,
  type CompactAircraft,
  type DataMode,
  type FeedStatus,
  type OverviewCompact,
} from "@aerotrack/shared";
import type { AircraftStore } from "./buffer";
import type { FollowEntry, FollowList } from "./follows";
import type { OverviewStore } from "./overview/overviewStore";
import type { PollerStatus } from "./poller";

// Payloads for /api/stream (SPEC 11.8). Each message is [event name, data].

export interface SnapshotData {
  now: number;
  mode: DataMode;
  feedStatus: FeedStatus;
  aircraft: CompactAircraft[];
}

export interface OverviewData {
  fetchedAt: number | null;
  feedStatus: FeedStatus;
  aircraft: OverviewCompact[];
}

export type StreamMessage =
  | ["snapshot", SnapshotData]
  | ["status", { feedStatus: FeedStatus; lastPollAt: number | null }]
  | ["event_open" | "event_update", BehaviourEvent]
  | ["event_close", { id: string; hex: string; closedAt: number | null }]
  | ["overview", OverviewData]
  | ["follows", FollowsData];

export interface FollowsData {
  max: number;
  follows: FollowEntry[];
}

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

export function overviewMessage(store: OverviewStore, feedStatus: FeedStatus): ["overview", OverviewData] {
  return ["overview", { fetchedAt: store.fetchedAt, feedStatus, aircraft: store.all().map(toOverviewCompact) }];
}

export function followsMessage(follows: FollowList): ["follows", FollowsData] {
  return ["follows", { max: follows.max, follows: follows.list() }];
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
