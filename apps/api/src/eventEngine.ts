import { runAll, type EventLifecycle, type LifecycleChanges } from "@aerotrack/detectors";
import type { Thresholds } from "@aerotrack/shared";
import type { AircraftStore } from "./buffer";

export interface EventEngineDeps {
  store: AircraftStore;
  lifecycle: EventLifecycle;
  thresholds: Thresholds;
}

/** Runs detectors for every buffered aircraft and applies the event lifecycle (SPEC 11.3). */
export function createEventEngine({ store, lifecycle, thresholds }: EventEngineDeps) {
  return {
    evaluate(nowSec: number): LifecycleChanges {
      const changes: LifecycleChanges = { opened: [], updated: [], closed: [] };
      const merge = (c: LifecycleChanges) => {
        changes.opened.push(...c.opened);
        changes.updated.push(...c.updated);
        changes.closed.push(...c.closed);
      };

      // Aircraft gone for keepSec leave the buffer; their events close.
      for (const hex of store.prune(nowSec)) merge(lifecycle.closeAll(hex, nowSec));

      // Includes aircraft missing from this poll, so signal loss is detected.
      for (const s of store.all()) {
        const { detections } = runAll(store.track(s.hex), {
          now: nowSec,
          lastPosTs: s.lastPosTs,
          squawk: s.squawk,
          emergency: s.emergency,
          thresholds,
        });
        merge(lifecycle.step(s.hex, detections, nowSec));
      }
      return changes;
    },
  };
}

export type EventEngine = ReturnType<typeof createEventEngine>;
