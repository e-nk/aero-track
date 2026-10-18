import { THRESHOLDS } from "@aerotrack/shared";

// The flights this browser watches for alerts (live mode). Kept in browser storage, so a
// reload remembers them. Storage can be missing or throw (private mode, blocked site data):
// then the list works in memory for the visit.

export const WATCH_KEY = "aerotrack.watch.v1";

export interface Watchlist {
  list(): string[];
  has(hex: string): boolean;
  /** False when the list is full. Adding a flight already watched is fine. */
  add(hex: string): boolean;
  remove(hex: string): void;
}

type SimpleStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): SimpleStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage: SimpleStorage | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(WATCH_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

export function createWatchlist(storage: SimpleStorage | null = browserStorage(), max: number = THRESHOLDS.follow.maxFollowed): Watchlist {
  let hexes = read(storage).slice(0, max);
  const save = () => {
    try {
      storage?.setItem(WATCH_KEY, JSON.stringify(hexes));
    } catch {
      // Not remembered after this visit; still works now.
    }
  };
  return {
    list: () => [...hexes],
    has: (hex) => hexes.includes(hex),
    add(hex) {
      if (hexes.includes(hex)) return true;
      if (hexes.length >= max) return false;
      hexes = [...hexes, hex];
      save();
      return true;
    },
    remove(hex) {
      hexes = hexes.filter((h) => h !== hex);
      save();
    },
  };
}
