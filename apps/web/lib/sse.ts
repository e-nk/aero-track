import type { BehaviourEvent, FeedStatus } from "@aerotrack/shared";
import type { Connection, OverviewData, SnapshotData } from "./liveState";

export interface LiveHandlers {
  onConnection: (c: Connection) => void;
  onSnapshot: (data: SnapshotData) => void;
  onStatus: (data: { feedStatus: FeedStatus; lastPollAt: number | null }) => void;
  onEventUpsert: (e: BehaviourEvent) => void;
  onEventClose: (data: { id: string; hex: string; closedAt: number | null }) => void;
  onOverview: (data: OverviewData) => void;
}

const MAX_RETRY_MS = 30_000;

/**
 * Connects to /api/stream. EventSource retries dropped connections itself;
 * if the server refuses (the source closes), we reconnect with backoff.
 * Returns a function that disconnects.
 */
export function connectLive(url: string, h: LiveHandlers): () => void {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let stopped = false;

  const on = <T>(name: string, fn: (data: T) => void) =>
    source?.addEventListener(name, (ev) => {
      try {
        fn(JSON.parse((ev as MessageEvent<string>).data) as T);
      } catch {
        // Ignore a malformed message; the next snapshot replaces state anyway.
      }
    });

  function open() {
    source = new EventSource(url);
    source.onopen = () => {
      attempts = 0;
      h.onConnection("open");
    };
    source.onerror = () => {
      h.onConnection("reconnecting");
      if (source?.readyState === EventSource.CLOSED && !stopped) {
        source.close();
        const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** attempts++);
        retryTimer = setTimeout(open, delay);
      }
    };
    on("snapshot", h.onSnapshot);
    on("status", h.onStatus);
    on("event_open", h.onEventUpsert);
    on("event_update", h.onEventUpsert);
    on("event_close", h.onEventClose);
    on("overview", h.onOverview);
  }

  open();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    source?.close();
  };
}
