import type { EventLifecycle } from "@aerotrack/detectors";
import type { AircraftState, BehaviourEvent, Observation, Thresholds } from "@aerotrack/shared";
import type { AircraftStore } from "./buffer";
import type { Repo } from "./repo";

export interface HydrateDeps {
  repo: Pick<Repo, "loadPositionsSince" | "loadAircraft" | "loadOpenEvents">;
  store: AircraftStore;
  lifecycle: EventLifecycle;
  nowSec: number;
  thresholds: Thresholds;
}

export interface HydrateSummary {
  aircraft: number;
  positions: number;
  restoredEvents: number;
  /** Events left open by the last run for aircraft no longer tracked. Persist these. */
  closedEvents: BehaviourEvent[];
}

/** On startup, reload the last keepSec of history so detectors work immediately (SPEC 11.2). */
export async function hydrate({ repo, store, lifecycle, nowSec, thresholds }: HydrateDeps): Promise<HydrateSummary> {
  const rows = await repo.loadPositionsSince(nowSec - thresholds.buffer.keepSec);

  const tracks = new Map<string, Observation[]>();
  const lastSquawk = new Map<string, string | null>();
  for (const r of rows) {
    const track = tracks.get(r.hex) ?? [];
    track.push(r.obs);
    tracks.set(r.hex, track);
    lastSquawk.set(r.hex, r.squawk); // rows are oldest first
  }

  const identities = new Map((await repo.loadAircraft([...tracks.keys()])).map((a) => [a.hex, a]));
  const states: AircraftState[] = [...tracks].map(([hex, track]) => {
    const last = track.at(-1)!;
    const id = identities.get(hex);
    return {
      hex,
      callsign: id?.callsign ?? null,
      registration: id?.registration ?? null,
      typeCode: id?.typeCode ?? null,
      typeDesc: id?.typeDesc ?? null,
      category: id?.category ?? null,
      squawk: lastSquawk.get(hex) ?? null,
      emergency: null, // not stored; the next poll refreshes it
      last,
      lastPosTs: last.t,
      mode: "live",
    };
  });
  store.hydrate(states, tracks);

  const open = await repo.loadOpenEvents();
  lifecycle.restore(open);
  const closedEvents: BehaviourEvent[] = [];
  for (const hex of new Set(open.map((e) => e.hex))) {
    if (!tracks.has(hex)) closedEvents.push(...lifecycle.closeAll(hex, nowSec).closed);
  }

  return {
    aircraft: states.length,
    positions: rows.length,
    restoredEvents: open.length - closedEvents.length,
    closedEvents,
  };
}
