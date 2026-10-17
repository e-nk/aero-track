import type { OverviewAircraft } from "@aerotrack/shared";

/** Latest Australia-wide overview (SPEC 11.10). In memory only; display, not detection. */
export class OverviewStore {
  private aircraft: OverviewAircraft[] = [];
  private fetched: number | null = null;

  set(fetchedAt: number, aircraft: OverviewAircraft[]): void {
    this.fetched = fetchedAt;
    this.aircraft = aircraft;
  }

  /** Provider time of the latest successful poll, epoch seconds. */
  get fetchedAt(): number | null {
    return this.fetched;
  }

  get size(): number {
    return this.aircraft.length;
  }

  all(): OverviewAircraft[] {
    return this.aircraft;
  }
}
