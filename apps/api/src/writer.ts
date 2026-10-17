import type { AircraftState, BehaviourEvent } from "@aerotrack/shared";
import type { PositionRow, Repo } from "./repo";
import type { Sighting } from "./sightings";

export interface WriterOptions {
  flushMs: number;
  maxRows: number;
  /** Cap on queued positions while the database is unreachable. Oldest are dropped. */
  maxQueuedRows?: number;
}

export interface WriterLog {
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/** Batched database writes (SPEC 11.4). Flushes never overlap. */
export function createWriter(repo: Repo, opts: WriterOptions, log: WriterLog) {
  const maxQueued = opts.maxQueuedRows ?? opts.maxRows * 20;
  let positions: PositionRow[] = [];
  let aircraft = new Map<string, AircraftState>();
  let events = new Map<string, BehaviourEvent>();
  let sightings = new Map<string, Sighting>();
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | undefined;

  function capPositions() {
    const excess = positions.length - maxQueued;
    if (excess > 0) {
      positions = positions.slice(excess);
      log.warn({ dropped: excess }, "Position queue full; dropped the oldest rows");
    }
  }

  async function writeBatch() {
    if (!positions.length && !aircraft.size && !events.size && !sightings.size) return;
    const batch = { positions, aircraft, events, sightings };
    positions = [];
    aircraft = new Map();
    events = new Map();
    sightings = new Map();

    try {
      if (batch.aircraft.size) await repo.upsertAircraft([...batch.aircraft.values()]);
      if (batch.positions.length) await repo.insertPositions(batch.positions);
      if (batch.events.size) await repo.upsertEvents([...batch.events.values()]);
      if (batch.sightings.size) await repo.upsertSightings([...batch.sightings.values()]);
    } catch (err) {
      log.error({ err }, "Database write failed; will retry on the next flush");
      // Writes are idempotent, so re-queue the whole batch. Newer queued versions win.
      positions = [...batch.positions, ...positions];
      for (const [hex, s] of batch.aircraft) if (!aircraft.has(hex)) aircraft.set(hex, s);
      for (const [id, e] of batch.events) if (!events.has(id)) events.set(id, e);
      for (const [id, s] of batch.sightings) if (!sightings.has(id)) sightings.set(id, s);
      capPositions();
    }
  }

  function flush(): Promise<void> {
    chain = chain.then(writeBatch);
    return chain;
  }

  return {
    addPositions(rows: PositionRow[]) {
      positions.push(...rows);
      capPositions();
      if (positions.length >= opts.maxRows) void flush();
    },
    addAircraft(states: AircraftState[]) {
      for (const s of states) aircraft.set(s.hex, s);
    },
    addEvents(list: BehaviourEvent[]) {
      for (const e of list) events.set(e.id, e);
    },
    addSightings(list: Sighting[]) {
      for (const s of list) sightings.set(s.id, s);
    },
    flush,
    start() {
      timer ??= setInterval(() => void flush(), opts.flushMs);
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await flush();
    },
  };
}

export type Writer = ReturnType<typeof createWriter>;
