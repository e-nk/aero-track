import type { AircraftState, BehaviourEvent, DataMode } from "@aerotrack/shared";
import type { NewObservation } from "./buffer";

export interface PositionRow extends NewObservation {
  mode: DataMode;
}

export type StoredPosition = NewObservation;

/** Persistence used by the api. Postgres in production (db/repo.ts), fakes in tests. */
export interface Repo {
  insertPositions(rows: PositionRow[]): Promise<void>;
  upsertAircraft(states: AircraftState[]): Promise<void>;
  upsertEvents(events: BehaviourEvent[]): Promise<void>;
  /** Live positions with t >= sinceSec, oldest first. */
  loadPositionsSince(sinceSec: number): Promise<StoredPosition[]>;
  /** Identity rows for the given aircraft. */
  loadAircraft(hexes: string[]): Promise<Omit<AircraftState, "last" | "lastPosTs" | "squawk" | "emergency" | "altGeomFt" | "mode">[]>;
  loadOpenEvents(): Promise<BehaviourEvent[]>;
  /** Most recent events for one aircraft, newest first. */
  recentEvents(hex: string, limit: number): Promise<BehaviourEvent[]>;
}
