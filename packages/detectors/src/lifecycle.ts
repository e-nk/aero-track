import type { BehaviourEvent, DataMode, Detection, EventType, Explanation, Thresholds } from "@aerotrack/shared";
import { explain } from "./explain";

// SPEC 9.10. Shared by the api event engine and the browser replay engine.

export interface LifecycleOptions {
  thresholds: Thresholds;
  mode: DataMode;
  newId: () => string;
  explain?: (d: Detection) => Explanation;
}

export interface LifecycleChanges {
  opened: BehaviourEvent[];
  updated: BehaviourEvent[];
  closed: BehaviourEvent[];
}

// Facts that end the moment the condition clears (SPEC 9.6).
const CLOSE_IMMEDIATELY: ReadonlySet<EventType> = new Set(["signal_lost"]);

const keyOf = (hex: string, type: EventType) => `${hex}|${type}`;

export class EventLifecycle {
  private readonly open = new Map<string, BehaviourEvent>();
  private readonly lastSeen = new Map<string, number>();
  private readonly closedAt = new Map<string, number>();
  private readonly explain: (d: Detection) => Explanation;

  constructor(private readonly opts: LifecycleOptions) {
    this.explain = opts.explain ?? ((d) => explain(d));
  }

  /** Apply one evaluation of an aircraft's detections at time `now` (epoch seconds). */
  step(hex: string, detections: Detection[], now: number): LifecycleChanges {
    const changes: LifecycleChanges = { opened: [], updated: [], closed: [] };
    const { closeAfterSec, reopenCooldownSec } = this.opts.thresholds.lifecycle;
    const seen = new Set<string>();

    for (const d of detections) {
      const key = keyOf(hex, d.type);
      seen.add(key);
      const current = this.open.get(key);

      if (current) {
        this.lastSeen.set(key, now);
        const next = this.merge(current, d, now);
        if (next) {
          this.open.set(key, next);
          changes.updated.push(next);
        }
        continue;
      }

      const closed = this.closedAt.get(key);
      if (closed !== undefined && now - closed < reopenCooldownSec) continue;

      const event: BehaviourEvent = {
        ...d,
        id: this.opts.newId(),
        hex,
        mode: this.opts.mode,
        status: "open",
        explanation: this.explain(d),
        explanationSource: "template",
        openedAt: now,
        updatedAt: now,
        closedAt: null,
      };
      this.open.set(key, event);
      this.lastSeen.set(key, now);
      changes.opened.push(event);
    }

    for (const [key, event] of this.open) {
      if (event.hex !== hex || seen.has(key)) continue;
      const quietFor = now - (this.lastSeen.get(key) ?? event.updatedAt);
      if (CLOSE_IMMEDIATELY.has(event.type) || quietFor >= closeAfterSec) {
        changes.closed.push(this.close(key, event, now));
      }
    }
    return changes;
  }

  /** Close every open event for an aircraft that is no longer tracked. */
  closeAll(hex: string, now: number): LifecycleChanges {
    const closed: BehaviourEvent[] = [];
    for (const [key, event] of this.open) if (event.hex === hex) closed.push(this.close(key, event, now));
    return { opened: [], updated: [], closed };
  }

  /** Continue events that were open before a restart. */
  restore(events: BehaviourEvent[]): void {
    for (const e of events) {
      if (e.status !== "open") continue;
      this.open.set(keyOf(e.hex, e.type), e); // quiet time counts from updatedAt
    }
  }

  openEvents(hex?: string): BehaviourEvent[] {
    return [...this.open.values()].filter((e) => hex === undefined || e.hex === hex);
  }

  private merge(current: BehaviourEvent, d: Detection, now: number): BehaviourEvent | null {
    const windowStart = Math.min(current.windowStart, d.windowStart);
    const windowEnd = Math.max(current.windowEnd, d.windowEnd);
    const unchanged =
      windowStart === current.windowStart &&
      windowEnd === current.windowEnd &&
      d.confidence === current.confidence &&
      JSON.stringify(d.evidence) === JSON.stringify(current.evidence);
    if (unchanged) return null;

    const detection: Detection = { type: d.type, confidence: d.confidence, windowStart, windowEnd, evidence: d.evidence };
    return { ...current, ...detection, explanation: this.explain(detection), updatedAt: now };
  }

  private close(key: string, event: BehaviourEvent, now: number): BehaviourEvent {
    const closed: BehaviourEvent = { ...event, status: "closed", closedAt: now, updatedAt: now };
    this.open.delete(key);
    this.lastSeen.delete(key);
    this.closedAt.set(key, now);
    return closed;
  }
}
