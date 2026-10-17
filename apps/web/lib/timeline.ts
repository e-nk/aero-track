import { DISPLAY_TIME_ZONE, type BehaviourEvent } from "@aerotrack/shared";
import { eventTitle } from "./eventCopy";

// Event timeline for one aircraft (SPEC 2, P1): what happened earlier, newest first.

export interface TimelineItem {
  id: string;
  title: string;
  when: string;
  seen: string;
}

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
      when: e.closedAt === null ? fmt(e.openedAt) : `${fmt(e.openedAt)} to ${fmt(e.closedAt)}`,
      seen: e.explanation.seen,
    }));
}
