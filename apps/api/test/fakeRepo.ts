import type { AircraftState, BehaviourEvent } from "@aerotrack/shared";
import type { PositionRow, Repo } from "../src/repo";
import type { RecordingFile, RecordingMeta } from "@aerotrack/shared";
import type { FollowEntry } from "../src/follows";
import type { Sighting } from "../src/sightings";

/** In-memory Repo for unit tests. */
export class FakeRepo implements Repo {
  positions: PositionRow[] = [];
  aircraft = new Map<string, AircraftState>();
  events = new Map<string, BehaviourEvent>();
  sightings = new Map<string, Sighting>();
  follows: FollowEntry[] = [];
  recordings = new Map<string, RecordingFile>();
  calls: string[] = [];
  failNext = 0;

  private maybeFail(name: string) {
    this.calls.push(name);
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error(`fake ${name} failure`);
    }
  }

  async insertPositions(rows: PositionRow[]) {
    this.maybeFail("insertPositions");
    this.positions.push(...rows);
  }
  async upsertAircraft(states: AircraftState[]) {
    this.maybeFail("upsertAircraft");
    for (const s of states) this.aircraft.set(s.hex, s);
  }
  async upsertEvents(events: BehaviourEvent[]) {
    this.maybeFail("upsertEvents");
    for (const e of events) this.events.set(e.id, e);
  }
  async upsertSightings(list: Sighting[]) {
    this.maybeFail("upsertSightings");
    for (const s of list) this.sightings.set(s.id, s);
  }
  async loadOpenSightings(sinceSec: number) {
    return [...this.sightings.values()].filter((s) => s.lastSeenAt >= sinceSec);
  }
  async sightingSummary(hex: string, sinceSec: number) {
    const mine = [...this.sightings.values()].filter((s) => s.hex === hex);
    return {
      total: mine.length,
      firstSeenAt: mine.length ? Math.min(...mine.map((s) => s.startedAt)) : null,
      recentIds: mine.filter((s) => s.startedAt >= sinceSec).map((s) => s.id),
    };
  }
  async saveFollows(list: FollowEntry[]) {
    this.maybeFail("saveFollows");
    this.follows = list.map((f) => ({ ...f }));
  }
  async loadFollows() {
    return this.follows.map((f) => ({ ...f }));
  }
  async loadPositionsBetween(fromSec: number, toSec: number) {
    return this.positions
      .filter((p) => p.mode === "live" && p.obs.t >= fromSec && p.obs.t <= toSec)
      .sort((a, b) => a.obs.t - b.obs.t)
      .map(({ hex, obs, squawk }) => ({ hex, obs, squawk }));
  }
  async saveRecording(rec: RecordingFile) {
    this.maybeFail("saveRecording");
    this.recordings.set(rec.id, rec);
  }
  async listRecordings(): Promise<RecordingMeta[]> {
    return [...this.recordings.values()]
      .sort((a, b) => b.capturedFrom - a.capturedFrom)
      .map(({ aircraft, ...meta }) => ({ ...meta, aircraftCount: aircraft.length }));
  }
  async getRecording(id: string) {
    return this.recordings.get(id) ?? null;
  }
  async loadPositionsSince(sinceSec: number) {
    return this.positions.filter((p) => p.obs.t >= sinceSec).sort((a, b) => a.obs.t - b.obs.t);
  }
  async loadAircraft(hexes: string[]) {
    return [...this.aircraft.values()]
      .filter((a) => hexes.includes(a.hex))
      .map(({ hex, callsign, registration, typeCode, typeDesc, category }) => ({
        hex,
        callsign,
        registration,
        typeCode,
        typeDesc,
        category,
      }));
  }
  async loadOpenEvents() {
    return [...this.events.values()].filter((e) => e.status === "open");
  }
  async recentEvents(hex: string, limit: number) {
    return [...this.events.values()]
      .filter((e) => e.hex === hex)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, limit);
  }
}
