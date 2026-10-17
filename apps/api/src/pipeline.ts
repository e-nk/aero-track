import type { LifecycleChanges } from "@aerotrack/detectors";
import type { AircraftStore } from "./buffer";
import type { EventEngine } from "./eventEngine";
import { adaptResponse } from "./providers/adsblol/adapter";
import type { ParsedResponse } from "./providers/adsblol/schema";
import type { Writer } from "./writer";

export interface PollResult {
  now: number; // provider clock, epoch seconds
  aircraftCount: number;
  newPositions: number;
  skipped: { notAircraft: number; noPosition: number; rejectedBySchema: number };
  changes: LifecycleChanges;
}

export interface PipelineDeps {
  store: AircraftStore;
  engine: EventEngine;
  writer: Pick<Writer, "addPositions" | "addAircraft" | "addEvents">;
}

/** What happens to one successful poll: adapt, buffer, detect, queue writes. */
export function createPipeline({ store, engine, writer }: PipelineDeps) {
  return {
    handle(parsed: ParsedResponse): PollResult {
      const now = parsed.now / 1000; // the provider's clock drives detection, not ours
      const { states, skipped } = adaptResponse(parsed);

      const added = store.ingest(states);
      writer.addPositions(added.map((a) => ({ ...a, mode: "live" as const })));
      writer.addAircraft(states);

      const changes = engine.evaluate(now);
      writer.addEvents([...changes.opened, ...changes.updated, ...changes.closed]);

      return {
        now,
        aircraftCount: store.all().length,
        newPositions: added.length,
        skipped: { ...skipped, rejectedBySchema: parsed.rejected },
        changes,
      };
    },
  };
}

export type Pipeline = ReturnType<typeof createPipeline>;
