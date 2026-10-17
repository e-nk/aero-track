import type { AircraftState, BehaviourEvent } from "@aerotrack/shared";
import type { PositionRow, Repo } from "../src/repo";

/** In-memory Repo for unit tests. */
export class FakeRepo implements Repo {
  positions: PositionRow[] = [];
  aircraft = new Map<string, AircraftState>();
  events = new Map<string, BehaviourEvent>();
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
