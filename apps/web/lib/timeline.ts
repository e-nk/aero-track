import { DISPLAY_TIME_ZONE, type BehaviourEvent, type EventType } from "@aerotrack/shared";
import { eventTitle } from "./eventCopy";

// Event timeline for one aircraft (SPEC 2, P1): what happened earlier, newest first.

export interface TimelineItem {
  id: string;
  title: string;
  when: string;
  /** Null when the sentence would no longer be true (see below). */
  seen: string | null;
}

// Sentences that stay true once an event has ended. The others describe a sliding window
// ("turned 34° in the last 2 minutes") or the present ("is transmitting"), so after the
// event they would only describe its last moment. Those entries show the title and times.
const STILL_TRUE: ReadonlySet<EventType> = new Set(["takeoff", "landing", "gap", "glitch"]);
// Moments rather than spans: show one time.
const MOMENTS: ReadonlySet<EventType> = new Set(["takeoff", "landing", "glitch"]);

const clock = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const fmt = (sec: number) => clock.format(new Date(sec * 1000)).replace(/\s?(AM|PM)$/, (m) => ` ${m.trim().toLowerCase()}`);

/** Ended events (open ones already have cards), newest first. */
export function earlierEvents(events: BehaviourEvent[], openIds: ReadonlySet<string>): TimelineItem[] {
  return events
    .filter((e) => e.status === "closed" && !openIds.has(e.id))
    .sort((a, b) => b.openedAt - a.openedAt)
    .map((e) => ({
      id: e.id,
      title: eventTitle(e.type),
      when: e.closedAt === null || MOMENTS.has(e.type) ? fmt(e.openedAt) : `${fmt(e.openedAt)} to ${fmt(e.closedAt)}`,
      seen: STILL_TRUE.has(e.type) ? e.explanation.seen : null,
    }));
}
