import type { AircraftState, BehaviourEvent, Observation } from "@aerotrack/shared";
import { API_URL } from "./config";
import type { SightingCounts } from "./format";

export type HistoryStatus = "ok" | "insufficient_history";

export interface AircraftDetail {
  state: AircraftState;
  history: HistoryStatus;
  openEvents: BehaviourEvent[];
  recentEvents: BehaviourEvent[];
  sightings?: SightingCounts;
}

const url = (path: string) => `${API_URL}${path}`;

/** GET /api/aircraft/:hex. "not_found" when the server can't see the aircraft. */
export async function fetchDetail(hex: string, signal?: AbortSignal): Promise<AircraftDetail | "not_found"> {
  const res = await fetch(url(`/api/aircraft/${encodeURIComponent(hex)}`), { signal });
  if (res.status === 404) return "not_found";
  if (!res.ok) throw new Error(`Aircraft details failed (${res.status})`);
  return (await res.json()) as AircraftDetail;
}

/** GET /api/aircraft/:hex/track, split into segments at gaps. */
export async function fetchTrack(hex: string, signal?: AbortSignal): Promise<Observation[][]> {
  const res = await fetch(url(`/api/aircraft/${encodeURIComponent(hex)}/track`), { signal });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Track failed (${res.status})`);
  return ((await res.json()) as { segments: Observation[][] }).segments;
}
