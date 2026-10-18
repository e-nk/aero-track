# Flight Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor watch a flight and get calm, plain-English alerts (toast plus optional system notification) when it takes off, lands, circles, loses or regains signal, squawks an emergency code or descends rapidly, in live mode and in recorded replays.

**Architecture:** Alerts are computed in the browser by one pure function (`lib/alerts.ts`) from event changes the app already receives: SSE `event_open`/`event_close` in live mode and `ReplayEngine.advanceTo` changes in recorded mode. The Zustand store keeps the watch lists and the alert list; thin components show the watch button, toasts, an alerts menu and a permission banner. No api, detector or database changes.

**Tech Stack:** Next.js (App Router) client components, React 19, Zustand 5, Vitest 5, TypeScript strict, Tailwind. Run commands from the repo root with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` set.

**Spec:** `docs/superpowers/specs/2026-10-18-flight-alerts-design.md`

## Global Constraints

- Rule 2: never invent values. Missing evidence renders "Not available" (the detectors' `NA`), a missing name falls back callsign → registration → hex.
- Rule 3: every alert carries its data mode; switching mode clears alerts and replay watches.
- Rule 4: all numeric alert constants live in `packages/shared/src/config/thresholds.ts` under `alerts: { backfillSec: 120, placeWithinKm: 60, toastMs: 8000, maxToasts: 3 }`.
- Rule 8: alert wording never states a cause. Use the exact strings in the spec's wording table.
- Copy style: plain English, short sentences, calm, never alarming.
- Live watch list: browser storage key `aerotrack.watch.v1`, at most `THRESHOLDS.follow.maxFollowed` (10) hexes.
- Alerts fire only on event open (plus `signal_lost` close), only for watched hexes, only for events with `openedAt >= since(hex)`.
- Before every commit: `pnpm typecheck && pnpm test` (and `pnpm lint`). Conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The same `event_open` delivered twice (SSE reconnect, duplicated message): expect one alert, not two. Test in Task 3.
2. Page reload while flights are watched (watch list persisted, events already open on the server): expect no flood of old alerts, because `since` is page load minus 120 s. Test in Task 3.
3. `new Notification()` throwing (Chrome on Android only allows notifications through a service worker): expect the in-page toast to still appear and no crash. Test in Task 5.
4. Browser storage holding garbage or throwing (private mode, blocked site data): expect an empty, working in-memory watch list. Test in Task 2.
5. Leaving a recording for live (or another recording) after watching there: expect replay watches and recorded alerts gone, live watches untouched. Test in Task 4.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/config/thresholds.ts` (modify) | `alerts` constants |
| `packages/detectors/src/index.ts` (modify) | export the formatters `NA`, `amount`, `clock`, `duration` |
| `apps/web/lib/alerts.ts` (create) | pure: alert wording, filtering, place phrase, merging into a list |
| `apps/web/lib/watchlist.ts` (create) | persisted live watch list with safe storage |
| `apps/web/lib/notify.ts` (create) | thin, failure-proof wrapper over the Notification API |
| `apps/web/lib/sse.ts` (modify) | separate `onEventOpen` handler |
| `apps/web/store/aircraftStore.ts` (modify) | watch state, alert list, live and replay alert wiring |
| `apps/web/components/recorded/RecordedView.tsx` (modify) | pass replay changes to the store |
| `apps/web/components/follow/WatchButton.tsx` (create, replaces `FollowButton.tsx`) | watch / stop watching |
| `apps/web/components/follow/FollowingList.tsx` (modify) | 🔔 on watched chips; × also unwatches |
| `apps/web/components/alerts/AlertToasts.tsx` (create) | toasts and system notifications |
| `apps/web/components/alerts/AlertsMenu.tsx` (create) | bell, unread count, list, footer |
| `apps/web/components/alerts/NotifyBanner.tsx` (create) | one-time permission offer |
| `apps/web/components/LiveView.tsx`, `panel/DetailsPanel.tsx` (modify) | mount the new components |
| tests: `apps/web/test/alerts.test.ts`, `watchlist.test.ts`, `alertsStore.test.ts`, `notify.test.ts`, `incidentReplay.test.ts` (extend) | |
| `docs/SPEC.md`, `README.md` (modify) | document alerts |

---

### Task 1: Alert wording and filtering (`lib/alerts.ts`)

**Files:**
- Modify: `packages/shared/src/config/thresholds.ts` (type block near `retention:` and values near `retention:`)
- Modify: `packages/detectors/src/index.ts:16`
- Create: `apps/web/lib/alerts.ts`
- Test: `apps/web/test/alerts.test.ts`

**Interfaces:**
- Consumes: `BehaviourEvent`, `DataMode`, `AIRPORTS`, `THRESHOLDS`, `DISPLAY_TIME_ZONE` from `@aerotrack/shared`; `nearestAirport(lat, lon, maxKm, airports?) => { airport: { name, lat, lon }, km } | null` from `@aerotrack/detectors`.
- Produces:
  - `type AlertKind = "takeoff" | "landing" | "circling" | "signal_lost" | "signal_back" | "emergency" | "rapid_descent"`
  - `interface Alert { id: string; eventId: string; hex: string; kind: AlertKind; title: string; body: string; at: number; mode: DataMode }`
  - `interface AlertInput { opened: readonly BehaviourEvent[]; closed: readonly BehaviourEvent[]; watched: ReadonlySet<string>; since: (hex: string) => number; identity: (hex: string) => { callsign: string | null; registration: string | null } | undefined; position: (hex: string) => { lat: number; lon: number } | undefined; mode: DataMode; timeZone?: string }`
  - `alertsForChanges(input: AlertInput): Alert[]`
  - `placePhrase(pos: { lat: number; lon: number } | undefined): string` (empty string or text ending in a space)
  - `appendAlerts(existing: readonly Alert[], fresh: readonly Alert[]): { alerts: Alert[]; added: number }` (dedupe by `id`, newest first, keep at most 50)

- [ ] **Step 1: Add the thresholds and formatter exports**

In `packages/shared/src/config/thresholds.ts`, add to the `Thresholds` type after the `retention` line:

```ts
  alerts: { backfillSec: number; placeWithinKm: number; toastMs: number; maxToasts: number };
```

and to `THRESHOLDS` after the `retention: {...}` line:

```ts
  // Flight alerts (alerts design spec): ignore events older than 2 min when watching starts or the page loads.
  alerts: { backfillSec: 120, placeWithinKm: 60, toastMs: 8000, maxToasts: 3 },
```

In `packages/detectors/src/index.ts`, after `export { explain, formatDuration } from "./explain";` add:

```ts
export { NA, amount, clock, duration } from "./format";
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/test/alerts.test.ts`:

```ts
import type { BehaviourEvent, EventType } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { alertsForChanges, appendAlerts, placePhrase, type Alert, type AlertInput } from "../lib/alerts";

const T = 1_731_029_700; // 8 Nov 2024, 12:35 pm in Sydney
const SYD = { lat: -33.946, lon: 151.177 }; // Sydney Kingsford Smith

const ev = (type: EventType, evidence: BehaviourEvent["evidence"], over: Partial<BehaviourEvent> = {}): BehaviourEvent => ({
  id: `e-${type}`,
  hex: "7c6db7",
  type,
  confidence: "observed",
  windowStart: T,
  windowEnd: T,
  evidence,
  mode: "recorded",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt: T,
  updatedAt: T,
  closedAt: null,
  ...over,
});

const input = (over: Partial<AlertInput> = {}): AlertInput => ({
  opened: [],
  closed: [],
  watched: new Set(["7c6db7"]),
  since: () => T - 120,
  identity: () => ({ callsign: "QFA520", registration: "VH-VYH" }),
  position: () => undefined,
  mode: "recorded",
  ...over,
});

const one = (over: Partial<AlertInput>) => {
  const out = alertsForChanges(input(over));
  expect(out).toHaveLength(1);
  return out[0]!;
};

describe("alert wording", () => {
  it("took off, near a known airport", () => {
    const a = one({ opened: [ev("takeoff", { at: T, airportName: "Sydney Kingsford Smith International Airport", airportKm: 1.2 })] });
    expect(a).toMatchObject({ kind: "takeoff", title: "QFA520 took off", body: "QFA520 took off near Sydney Kingsford Smith International Airport at 12:35 pm.", at: T, mode: "recorded" });
  });

  it("landed, away from known airports", () => {
    const a = one({ opened: [ev("landing", { at: T })] });
    expect(a.body).toBe("QFA520 landed at 12:35 pm, away from the airports we know about.");
  });

  it("circling, with a place only near a known airport", () => {
    const evidence = { totalDeg: 540, spanSec: 360, altSpreadFt: 0 };
    const near = one({ opened: [ev("circling", evidence)], position: () => ({ lat: SYD.lat - 0.225, lon: SYD.lon }) });
    expect(near.title).toBe("QFA520 is circling");
    expect(near.body).toBe(
      "QFA520 has been circling about 25 km south of Sydney Kingsford Smith International Airport for about 6 minutes. Aircraft commonly do this while waiting to land. The data doesn't show why.",
    );
    const far = one({ opened: [ev("circling", evidence)], position: () => ({ lat: -36.5, lon: 151.2 }) });
    expect(far.body).toBe("QFA520 has been circling for about 6 minutes. Aircraft commonly do this while waiting to land. The data doesn't show why.");
  });

  it("signal lost, then tracking again", () => {
    const lost = ev("signal_lost", { secondsSinceLastPosition: 300 });
    expect(one({ opened: [lost] })).toMatchObject({
      kind: "signal_lost",
      title: "No new position for QFA520",
      body: "We haven't had a position for QFA520 for 5 minutes. This is common over the ocean, where there are few receivers.",
    });
    const back = one({ closed: [{ ...lost, status: "closed", closedAt: T + 400 }] });
    expect(back).toMatchObject({ kind: "signal_back", title: "Tracking QFA520 again", body: "New positions for QFA520 are arriving again.", at: T + 400 });
  });

  it("emergency code", () => {
    expect(one({ opened: [ev("emergency", { squawk: "7700" })] })).toMatchObject({
      title: "QFA520 is transmitting an emergency code",
      body: "Crews use these codes to get priority help, and many such flights land normally. The data doesn't show why. Check with the airline for official information.",
    });
  });

  it("rapid descent, and Not available when the rate is missing", () => {
    expect(one({ opened: [ev("rapid_descent", { peakRateFpm: -5240 })] }).body).toBe(
      "About 5,200 ft per minute. The data doesn't show why. Check with the airline for official information.",
    );
    expect(one({ opened: [ev("rapid_descent", {})] }).body).toBe(
      "About Not available ft per minute. The data doesn't show why. Check with the airline for official information.",
    );
  });

  it("names the flight by callsign, then registration, then hex", () => {
    const opened = [ev("landing", { at: T })];
    expect(one({ opened, identity: () => ({ callsign: null, registration: "VH-VYH" }) }).title).toBe("VH-VYH landed");
    expect(one({ opened, identity: () => undefined }).title).toBe("7c6db7 landed");
  });
});

describe("alert filtering", () => {
  it("ignores flights that aren't watched", () => {
    expect(alertsForChanges(input({ opened: [ev("landing", { at: T })], watched: new Set() }))).toEqual([]);
  });

  it("ignores events that opened before the backfill window", () => {
    expect(alertsForChanges(input({ opened: [ev("landing", { at: T })], since: () => T + 1 }))).toEqual([]);
  });

  it("ignores kinds that aren't alerts (climb, descent, turn, gap, glitch)", () => {
    const types: EventType[] = ["climb", "descent", "turn", "gap", "glitch"];
    expect(alertsForChanges(input({ opened: types.map((t) => ev(t, {})) }))).toEqual([]);
  });

  it("only says 'tracking again' for a signal loss it would have alerted", () => {
    const old = ev("signal_lost", {}, { openedAt: T - 1000, status: "closed", closedAt: T });
    expect(alertsForChanges(input({ closed: [old] }))).toEqual([]);
    expect(alertsForChanges(input({ closed: [ev("landing", {}, { status: "closed", closedAt: T })] }))).toEqual([]);
  });

  it("gives stable, distinct ids for open and close", () => {
    const lost = ev("signal_lost", {});
    const [open] = alertsForChanges(input({ opened: [lost] }));
    const [close] = alertsForChanges(input({ closed: [{ ...lost, status: "closed", closedAt: T + 60 }] }));
    expect([open!.id, close!.id]).toEqual(["e-signal_lost:open", "e-signal_lost:close"]);
  });
});

describe("placePhrase", () => {
  it("says 'near' when within 3 km, nothing when outside the limit or unknown", () => {
    expect(placePhrase(SYD)).toBe("near Sydney Kingsford Smith International Airport ");
    expect(placePhrase({ lat: -36.5, lon: 151.2 })).toBe("");
    expect(placePhrase(undefined)).toBe("");
  });
});

describe("appendAlerts", () => {
  const a = (id: string, at: number): Alert => ({ id, eventId: id, hex: "x", kind: "landing", title: id, body: "", at, mode: "live" });

  it("adds new alerts newest first and ignores duplicates", () => {
    const first = appendAlerts([], [a("1", 10)]);
    const second = appendAlerts(first.alerts, [a("1", 10), a("2", 20)]);
    expect(second.added).toBe(1);
    expect(second.alerts.map((x) => x.id)).toEqual(["2", "1"]);
  });

  it("keeps at most 50", () => {
    const many = Array.from({ length: 60 }, (_, i) => a(String(i), i));
    expect(appendAlerts([], many).alerts).toHaveLength(50);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/alerts.test.ts`
Expected: FAIL with "Cannot find module '../lib/alerts'".

- [ ] **Step 4: Implement `lib/alerts.ts`**

Create `apps/web/lib/alerts.ts`:

```ts
import { NA, amount, clock, duration, nearestAirport } from "@aerotrack/detectors";
import { AIRPORTS, DISPLAY_TIME_ZONE, THRESHOLDS, type BehaviourEvent, type DataMode } from "@aerotrack/shared";

// Flight alerts (docs/superpowers/specs/2026-10-18-flight-alerts-design.md). Pure: no DOM, no store.
// Wording never states a cause (rule 8); missing values read "Not available" (rule 2).

export type AlertKind = "takeoff" | "landing" | "circling" | "signal_lost" | "signal_back" | "emergency" | "rapid_descent";

export interface Alert {
  id: string;
  eventId: string;
  hex: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: number; // epoch seconds
  mode: DataMode;
}

export interface AlertInput {
  opened: readonly BehaviourEvent[];
  closed: readonly BehaviourEvent[];
  watched: ReadonlySet<string>;
  /** Events that opened before this time (epoch seconds) don't alert. */
  since: (hex: string) => number;
  identity: (hex: string) => { callsign: string | null; registration: string | null } | undefined;
  position: (hex: string) => { lat: number; lon: number } | undefined;
  mode: DataMode;
  timeZone?: string;
}

const MAX_ALERTS = 50;
const NEAR_KM = 3;
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lon - from.lon) * rad) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lon - from.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** "about 25 km south of {airport} " near a known airport, otherwise "" (never guessed). */
export function placePhrase(pos: { lat: number; lon: number } | undefined): string {
  if (!pos) return "";
  const near = nearestAirport(pos.lat, pos.lon, THRESHOLDS.alerts.placeWithinKm, AIRPORTS);
  if (!near) return "";
  const { airport, km } = near;
  if (km < NEAR_KM) return `near ${airport.name} `;
  const dir = COMPASS[Math.round(bearingDeg(airport, pos) / 45) % 8];
  return `about ${Math.max(5, Math.round(km / 5) * 5)} km ${dir} of ${airport.name} `;
}

/** "near {airport} at 12:35 pm" or "at 12:35 pm, away from the airports we know about" (same as the explanations). */
function where(e: BehaviourEvent["evidence"], timeZone: string): string {
  const time = clock(e.at, timeZone);
  return typeof e.airportName === "string" ? `near ${e.airportName} at ${time}` : `at ${time}, away from the airports we know about`;
}

const CHECK_AIRLINE = "The data doesn't show why. Check with the airline for official information.";

function wordingForOpen(e: BehaviourEvent, name: string, input: AlertInput, timeZone: string): { kind: AlertKind; title: string; body: string } | null {
  const ev = e.evidence;
  switch (e.type) {
    case "takeoff":
      return { kind: "takeoff", title: `${name} took off`, body: `${name} took off ${where(ev, timeZone)}.` };
    case "landing":
      return { kind: "landing", title: `${name} landed`, body: `${name} landed ${where(ev, timeZone)}.` };
    case "circling":
      return {
        kind: "circling",
        title: `${name} is circling`,
        body: `${name} has been circling ${placePhrase(input.position(e.hex))}for about ${duration(ev.spanSec)}. Aircraft commonly do this while waiting to land. The data doesn't show why.`,
      };
    case "signal_lost":
      return {
        kind: "signal_lost",
        title: `No new position for ${name}`,
        body: `We haven't had a position for ${name} for ${duration(ev.secondsSinceLastPosition)}. This is common over the ocean, where there are few receivers.`,
      };
    case "emergency":
      return {
        kind: "emergency",
        title: `${name} is transmitting an emergency code`,
        body: `Crews use these codes to get priority help, and many such flights land normally. ${CHECK_AIRLINE}`,
      };
    case "rapid_descent": {
      const rate = amount(ev.peakRateFpm, 100);
      return { kind: "rapid_descent", title: `${name} is descending faster than usual`, body: `About ${rate || NA} ft per minute. ${CHECK_AIRLINE}` };
    }
    default:
      return null; // climbs, descents, turns, gaps and glitches don't alert
  }
}

export function alertsForChanges(input: AlertInput): Alert[] {
  const timeZone = input.timeZone ?? DISPLAY_TIME_ZONE;
  const nameOf = (hex: string) => {
    const id = input.identity(hex);
    return id?.callsign ?? id?.registration ?? hex;
  };
  const relevant = (e: BehaviourEvent) => input.watched.has(e.hex) && e.openedAt >= input.since(e.hex);
  const out: Alert[] = [];

  for (const e of input.opened) {
    if (!relevant(e)) continue;
    const w = wordingForOpen(e, nameOf(e.hex), input, timeZone);
    if (w) out.push({ id: `${e.id}:open`, eventId: e.id, hex: e.hex, ...w, at: e.openedAt, mode: input.mode });
  }
  for (const e of input.closed) {
    if (e.type !== "signal_lost" || !relevant(e)) continue;
    const name = nameOf(e.hex);
    out.push({
      id: `${e.id}:close`,
      eventId: e.id,
      hex: e.hex,
      kind: "signal_back",
      title: `Tracking ${name} again`,
      body: `New positions for ${name} are arriving again.`,
      at: e.closedAt ?? e.updatedAt,
      mode: input.mode,
    });
  }
  return out;
}

/** Merge fresh alerts into the list: no duplicates (by id), newest first, at most 50. */
export function appendAlerts(existing: readonly Alert[], fresh: readonly Alert[]): { alerts: Alert[]; added: number } {
  const seen = new Set(existing.map((a) => a.id));
  const novel: Alert[] = [];
  for (const a of fresh) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    novel.push(a);
  }
  if (!novel.length) return { alerts: existing as Alert[], added: 0 };
  const alerts = [...novel, ...existing].sort((a, b) => b.at - a.at).slice(0, MAX_ALERTS);
  return { alerts, added: novel.length };
}
```

Note: `amount` already returns "Not available" for a missing value, so `rate || NA` is only a guard against an empty string.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/alerts.test.ts`
Expected: PASS (all tests). If the circling place names a different airport or distance, another airport in `AIRPORTS` is nearer that test point: move the test point (keep Sydney Kingsford Smith the nearest, about 25 km due south) rather than changing the rounding or direction logic.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add packages/shared/src/config/thresholds.ts packages/detectors/src/index.ts apps/web/lib/alerts.ts apps/web/test/alerts.test.ts
git commit -m "feat(web): alert wording and filtering for watched flights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Persisted watch list (`lib/watchlist.ts`)

**Files:**
- Create: `apps/web/lib/watchlist.ts`
- Test: `apps/web/test/watchlist.test.ts`

**Interfaces:**
- Consumes: `THRESHOLDS.follow.maxFollowed`.
- Produces:
  - `interface Watchlist { list(): string[]; has(hex: string): boolean; add(hex: string): boolean; remove(hex: string): void }` (`add` returns false when full; adding an existing hex returns true)
  - `createWatchlist(storage?: Pick<Storage, "getItem" | "setItem"> | null, max?: number): Watchlist`
  - `WATCH_KEY = "aerotrack.watch.v1"`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/watchlist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WATCH_KEY, createWatchlist } from "../lib/watchlist";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("watchlist", () => {
  it("adds, lists and removes, and remembers across instances", () => {
    const storage = memoryStorage();
    const w = createWatchlist(storage);
    expect(w.add("7c6db7")).toBe(true);
    expect(w.add("7c6db7")).toBe(true);
    expect(w.list()).toEqual(["7c6db7"]);
    expect(createWatchlist(storage).has("7c6db7")).toBe(true);
    w.remove("7c6db7");
    expect(createWatchlist(storage).list()).toEqual([]);
    expect(storage.data.get(WATCH_KEY)).toBe("[]");
  });

  it("refuses more than the limit", () => {
    const w = createWatchlist(memoryStorage(), 2);
    expect([w.add("a"), w.add("b"), w.add("c")]).toEqual([true, true, false]);
    expect(w.list()).toEqual(["a", "b"]);
  });

  it("ignores garbage in storage", () => {
    const storage = memoryStorage();
    storage.setItem(WATCH_KEY, "{not json");
    expect(createWatchlist(storage).list()).toEqual([]);
    storage.setItem(WATCH_KEY, JSON.stringify(["ok", 42, null]));
    expect(createWatchlist(storage).list()).toEqual(["ok"]);
  });

  it("works in memory when storage throws or is missing", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const w = createWatchlist(throwing);
    expect(w.add("a")).toBe(true);
    expect(w.list()).toEqual(["a"]);
    expect(createWatchlist(null).add("b")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/watchlist.test.ts`
Expected: FAIL with "Cannot find module '../lib/watchlist'".

- [ ] **Step 3: Implement `lib/watchlist.ts`**

```ts
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

export function createWatchlist(storage: SimpleStorage | null = browserStorage(), max = THRESHOLDS.follow.maxFollowed): Watchlist {
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/watchlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add apps/web/lib/watchlist.ts apps/web/test/watchlist.test.ts
git commit -m "feat(web): remember watched flights in the browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Live alerts in the store

**Files:**
- Modify: `apps/web/lib/sse.ts:4-12` (handler type) and `:52` (`event_open` wiring)
- Modify: `apps/web/store/aircraftStore.ts`
- Test: `apps/web/test/alertsStore.test.ts`

**Interfaces:**
- Consumes: `alertsForChanges`, `appendAlerts`, `type Alert` (Task 1); `createWatchlist` (Task 2).
- Produces (store, used by Tasks 4 and 6):
  - state: `alerts: Alert[]`, `unreadAlerts: number`, `watched: string[]` (live), `replayWatch: string[]`, `watchSince: Record<string, number>`, `alertsSince: number` (epoch seconds; page load or last mode switch)
  - actions: `watch(hex: string, nowSec: number): boolean` (false when full), `unwatch(hex: string): void`, `markAlertsRead(): void`
  - `LiveHandlers.onEventOpen: (e: BehaviourEvent) => void`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/alertsStore.test.ts`:

```ts
import type { BehaviourEvent } from "@aerotrack/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { useAircraftStore } from "../store/aircraftStore";

const NOW = 1_792_300_000;
const landing = (id: string, openedAt: number, hex = "7c6db7"): BehaviourEvent => ({
  id,
  hex,
  type: "landing",
  confidence: "fact",
  windowStart: openedAt,
  windowEnd: openedAt,
  evidence: { at: openedAt },
  mode: "live",
  status: "open",
  explanation: { seen: "s", cannotTell: "c" },
  explanationSource: "template",
  openedAt,
  updatedAt: openedAt,
  closedAt: null,
});

beforeEach(() => {
  const s = useAircraftStore.getState();
  s.reset();
  for (const hex of s.watched) s.unwatch(hex);
  useAircraftStore.setState({ alertsSince: NOW - 3600 });
});

describe("live alerts", () => {
  it("alerts once for a watched flight's new event, even if the message arrives twice", () => {
    const s = useAircraftStore.getState();
    expect(s.watch("7c6db7", NOW - 60)).toBe(true);
    s.handlers.onEventOpen(landing("e1", NOW));
    s.handlers.onEventOpen(landing("e1", NOW));
    const { alerts, unreadAlerts } = useAircraftStore.getState();
    expect(alerts.map((a) => [a.kind, a.mode])).toEqual([["landing", "live"]]);
    expect(unreadAlerts).toBe(1);
  });

  it("does not alert for flights that aren't watched, or for updates", () => {
    const s = useAircraftStore.getState();
    s.handlers.onEventOpen(landing("e2", NOW, "7c0001"));
    s.watch("7c6db7", NOW - 60);
    s.handlers.onEventUpsert(landing("e3", NOW));
    expect(useAircraftStore.getState().alerts).toEqual([]);
  });

  it("does not replay old events after a reload (backfill window from page load)", () => {
    useAircraftStore.getState().watch("7c6db7", NOW - 86_400); // watched yesterday, remembered
    useAircraftStore.setState({ alertsSince: NOW, watchSince: {} }); // page just loaded
    useAircraftStore.getState().handlers.onEventOpen(landing("old", NOW - 600));
    useAircraftStore.getState().handlers.onEventOpen(landing("new", NOW + 5));
    expect(useAircraftStore.getState().alerts.map((a) => a.eventId)).toEqual(["new"]);
  });

  it("says 'tracking again' when a watched flight's signal-lost event closes", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW - 60);
    s.handlers.onEventOpen({ ...landing("lost", NOW), type: "signal_lost", evidence: { secondsSinceLastPosition: 300 } });
    s.handlers.onEventClose({ id: "lost", hex: "7c6db7", closedAt: NOW + 120 });
    expect(useAircraftStore.getState().alerts.map((a) => a.kind)).toEqual(["signal_back", "signal_lost"]);
  });

  it("never alerts for events loaded with the details (opened before we looked)", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW - 60);
    s.seedEvents({ state: { hex: "7c6db7" }, history: "ok", openEvents: [landing("seeded", NOW)], recentEvents: [] } as unknown as Parameters<typeof s.seedEvents>[0]);
    expect(useAircraftStore.getState().alerts).toEqual([]);
  });

  it("unwatching stops alerts; markAlertsRead clears the count", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW - 60);
    s.handlers.onEventOpen(landing("e4", NOW));
    s.markAlertsRead();
    s.unwatch("7c6db7");
    s.handlers.onEventOpen(landing("e5", NOW));
    expect(useAircraftStore.getState()).toMatchObject({ unreadAlerts: 0, watched: [] });
    expect(useAircraftStore.getState().alerts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/alertsStore.test.ts`
Expected: FAIL (`s.watch is not a function` / `onEventOpen` missing).

- [ ] **Step 3: Give `event_open` its own handler**

In `apps/web/lib/sse.ts`, add to `LiveHandlers` after `onEventUpsert`:

```ts
  /** A new event (event_open). Kept apart from updates so alerts fire only once. */
  onEventOpen: (e: BehaviourEvent) => void;
```

and change `on("event_open", h.onEventUpsert);` to:

```ts
    on("event_open", h.onEventOpen);
```

- [ ] **Step 4: Add watch and alert state to the store**

In `apps/web/store/aircraftStore.ts`:

1. Imports (top of file, beside the existing ones):

```ts
import { THRESHOLDS } from "@aerotrack/shared";
import { alertsForChanges, appendAlerts, type Alert } from "../lib/alerts";
import { createWatchlist } from "../lib/watchlist";
```

2. Below the imports:

```ts
// The live watch list is remembered in browser storage (Task 2 of the alerts plan).
const watchlist = createWatchlist();
const nowSec = () => Date.now() / 1000;
```

3. Add to the `AircraftStore` interface (before `reset`):

```ts
  /** Alerts for watched flights (alerts design spec), newest first, this visit only. */
  alerts: Alert[];
  unreadAlerts: number;
  /** Live: flights this browser watches (persisted). */
  watched: string[];
  /** Recorded: flights watched in this replay (memory only). */
  replayWatch: string[];
  /** When each flight was watched (epoch seconds; replay clock in recorded mode). */
  watchSince: Record<string, number>;
  /** Page load or last mode switch (epoch seconds). Older events never alert. */
  alertsSince: number;
  /** False when the watch list is full. */
  watch: (hex: string, nowSec: number) => boolean;
  unwatch: (hex: string) => void;
  markAlertsRead: () => void;
```

4. Add a helper above `export const useAircraftStore`:

```ts
const EMPTY_ALERTS = { alerts: [] as Alert[], unreadAlerts: 0, replayWatch: [] as string[], watchSince: {} as Record<string, number> };

/** Live alert step: run the pure function against the current store and merge the result. */
function liveAlerts(s: AircraftStore, opened: BehaviourEvent[], closed: BehaviourEvent[]): Partial<AircraftStore> {
  if (s.mode !== "live" || !s.watched.length) return {};
  const fresh = alertsForChanges({
    opened,
    closed,
    watched: new Set(s.watched),
    since: (hex) => Math.max(s.alertsSince, s.watchSince[hex] ?? 0) - THRESHOLDS.alerts.backfillSec,
    identity: (hex) => ({ callsign: s.aircraft[hex]?.callsign ?? s.overview?.aircraft[hex]?.callsign ?? null, registration: null }),
    position: (hex) => s.aircraft[hex] ?? s.overview?.aircraft[hex],
    mode: "live",
  });
  const { alerts, added } = appendAlerts(s.alerts, fresh);
  return added ? { alerts, unreadAlerts: s.unreadAlerts + added } : {};
}
```

5. In the store body, add the initial state next to `filters: NO_FILTERS,`:

```ts
  ...EMPTY_ALERTS,
  watched: watchlist.list(),
  alertsSince: nowSec(),
  watch: (hex, now) => {
    const s = useAircraftStore.getState();
    if (s.mode === "recorded") {
      if (!s.replayWatch.includes(hex)) set({ replayWatch: [...s.replayWatch, hex], watchSince: { ...s.watchSince, [hex]: s.replay?.clock ?? now } });
      return true;
    }
    if (!watchlist.add(hex)) return false;
    set({ watched: watchlist.list(), watchSince: { ...s.watchSince, [hex]: now } });
    return true;
  },
  unwatch: (hex) =>
    set((s) => {
      if (s.mode === "recorded") return { replayWatch: s.replayWatch.filter((h) => h !== hex) };
      watchlist.remove(hex);
      return { watched: watchlist.list() };
    }),
  markAlertsRead: () => set({ unreadAlerts: 0 }),
```

6. In `handlers`, add `onEventOpen` and change `onEventClose`:

```ts
    onEventOpen: (e) => set((s) => ({ ...applyEventUpsert(s, e), ...liveAlerts(s, [e], []) })),
    onEventClose: (data) =>
      set((s) => {
        const known = s.events[data.id];
        const closed = known ? [{ ...known, status: "closed" as const, closedAt: data.closedAt }] : [];
        return { ...applyEventClose(s, data), ...liveAlerts(s, [], closed) };
      }),
```

7. Clear alerts on mode switches. In `startRecorded` add `...EMPTY_ALERTS, alertsSince: nowSec(),` to the object passed to `set`, and in `reset` add `...EMPTY_ALERTS, alertsSince: nowSec(), watched: watchlist.list(),`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/alertsStore.test.ts`
Expected: PASS. Then run the whole web suite (`npx vitest run`). Any existing test that builds a `LiveHandlers` object by hand now needs an `onEventOpen` entry (search: `grep -ln onEventUpsert apps/web/test`); add `onEventOpen: () => {}` there, or the handler under test, without changing what the test asserts.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add apps/web/lib/sse.ts apps/web/store/aircraftStore.ts apps/web/test/alertsStore.test.ts
git commit -m "feat(web): alert on new events for watched flights in live mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Alerts in recorded replays

**Files:**
- Modify: `apps/web/store/aircraftStore.ts` (new action)
- Modify: `apps/web/components/recorded/RecordedView.tsx:58-91` (pass changes)
- Test: `apps/web/test/incidentReplay.test.ts` (extend), `apps/web/test/alertsStore.test.ts` (extend)

**Interfaces:**
- Consumes: `LifecycleChanges` from `@aerotrack/detectors`; `ReplayEngine.identity(hex)`, `ReplayEngine.track(hex)`; store from Task 3.
- Produces:
  - exported type `ReplayLookup = { identity: (hex: string) => { callsign: string | null; registration: string | null } | undefined; position: (hex: string) => { lat: number; lon: number } | undefined }` (from `store/aircraftStore.ts`)
  - store action `applyReplayChanges(changes: LifecycleChanges, lookup: ReplayLookup): void`
  - store action `resetReplayAlerts(): void`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/incidentReplay.test.ts` (it already loads `rec` and imports `ReplayEngine`, `THRESHOLDS`):

```ts
import { alertsForChanges } from "../lib/alerts";

describe("alerts on the archived incident", () => {
  it("watching QFA520 gives took off, circling and landed, in that order, all recorded", () => {
    const e = new ReplayEngine(rec, THRESHOLDS);
    const kinds: string[] = [];
    const bodies: string[] = [];
    for (let t = e.start; t <= e.end; t += 10) {
      const changes = e.advanceTo(t);
      for (const a of alertsForChanges({
        opened: changes.opened,
        closed: changes.closed,
        watched: new Set(["7c6db7"]),
        since: () => e.start - THRESHOLDS.alerts.backfillSec,
        identity: (hex) => e.identity(hex),
        position: (hex) => e.track(hex).at(-1),
        mode: rec.mode,
      })) {
        expect(a.mode).toBe("recorded");
        kinds.push(a.kind);
        bodies.push(a.body);
      }
    }
    expect(kinds).toEqual(["takeoff", "circling", "landing"]);
    expect(bodies[1]).toMatch(/^QFA520 has been circling about \d+ km south(-east|-west)? of Sydney Kingsford Smith International Airport for about/);
  });
});
```

Append to `apps/web/test/alertsStore.test.ts`:

```ts
describe("replay alerts", () => {
  const replayInfo = { id: "r", title: "t", start: NOW, end: NOW + 600, clock: NOW, speed: 10, playing: true, attribution: "a", reportedCause: null, mode: "recorded" as const };
  const lookup = { identity: () => ({ callsign: "QFA520", registration: null }), position: () => undefined };

  it("alerts for flights watched in the replay, and clears them when leaving", () => {
    const s = useAircraftStore.getState();
    s.watch("7c6db7", NOW); // live watch
    s.startRecorded(replayInfo);
    useAircraftStore.getState().watch("7c6db7", 0); // replay watch at replay clock NOW
    useAircraftStore.getState().applyReplayChanges({ opened: [{ ...landing("r1", NOW + 30), mode: "recorded" }], updated: [], closed: [] }, lookup);
    expect(useAircraftStore.getState().alerts.map((a) => [a.kind, a.mode])).toEqual([["landing", "recorded"]]);

    useAircraftStore.getState().reset(); // back to live
    expect(useAircraftStore.getState()).toMatchObject({ alerts: [], replayWatch: [], watched: ["7c6db7"] });
  });

  it("resetReplayAlerts empties the list (used when seeking backwards)", () => {
    useAircraftStore.getState().startRecorded(replayInfo);
    useAircraftStore.getState().watch("7c6db7", 0);
    useAircraftStore.getState().applyReplayChanges({ opened: [{ ...landing("r2", NOW + 30), mode: "recorded" }], updated: [], closed: [] }, lookup);
    useAircraftStore.getState().resetReplayAlerts();
    expect(useAircraftStore.getState()).toMatchObject({ alerts: [], unreadAlerts: 0, replayWatch: ["7c6db7"] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/incidentReplay.test.ts test/alertsStore.test.ts`
Expected: the incident test PASSES already if Task 1 is right (it exercises the pure function on real data: keep it as the regression pin); the store tests FAIL with `applyReplayChanges is not a function`. If the incident test fails, fix `lib/alerts.ts`, not the test, unless the trace genuinely shows another kind (then stop and report).

- [ ] **Step 3: Add the replay actions to the store**

Interface additions in `apps/web/store/aircraftStore.ts`:

```ts
  /** Recorded mode: alerts for one replay step's lifecycle changes. */
  applyReplayChanges: (changes: LifecycleChanges, lookup: ReplayLookup) => void;
  /** Recorded mode: forget alerts (seeking backwards replays from the start). */
  resetReplayAlerts: () => void;
```

Import: `import type { LifecycleChanges } from "@aerotrack/detectors";` and export, above the interface:

```ts
/** How replay alerts look up a flight's name and position (from the ReplayEngine). */
export interface ReplayLookup {
  identity: (hex: string) => { callsign: string | null; registration: string | null } | undefined;
  position: (hex: string) => { lat: number; lon: number } | undefined;
}
```

Implementations (store body):

```ts
  applyReplayChanges: (changes, lookup) =>
    set((s) => {
      if (s.mode !== "recorded" || !s.replay || !s.replayWatch.length) return {};
      const fresh = alertsForChanges({
        opened: changes.opened,
        closed: changes.closed,
        watched: new Set(s.replayWatch),
        since: (hex) => (s.watchSince[hex] ?? s.replay!.start) - THRESHOLDS.alerts.backfillSec,
        identity: lookup.identity,
        position: lookup.position,
        mode: s.replay.mode,
      });
      const { alerts, added } = appendAlerts(s.alerts, fresh);
      return added ? { alerts, unreadAlerts: s.unreadAlerts + added } : {};
    }),
  resetReplayAlerts: () => set({ alerts: [], unreadAlerts: 0 }),
```

- [ ] **Step 4: Pass replay changes from `RecordedView`**

In `apps/web/components/recorded/RecordedView.tsx`, inside the engine effect, add after `const engine = new ReplayEngine(...)`/`startRecorded(...)`:

```ts
    const lookup: ReplayLookup = {
      identity: (hex) => engine.identity(hex),
      position: (hex) => engine.track(hex).at(-1),
    };
```

Replace the timer body's `engine.advanceTo(engine.clock + (TICK_MS / 1000) * replay.speed);` with:

```ts
        const changes = engine.advanceTo(engine.clock + (TICK_MS / 1000) * replay.speed);
        useAircraftStore.getState().applyReplayChanges(changes, lookup);
```

Import `type ReplayLookup` from `../../store/aircraftStore`. Store `lookup` on a ref so `seek` can use it: add `const lookupRef = useRef<ReplayLookup | null>(null);` next to `engineRef`, set `lookupRef.current = lookup;` in the effect, and change `seek` to:

```ts
  const seek = (t: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const store = useAircraftStore.getState();
    if (t < engine.clock) store.resetReplayAlerts(); // replaying from the start: don't repeat old alerts
    const changes = engine.seek(t);
    if (lookupRef.current) store.applyReplayChanges(changes, lookupRef.current);
    store.setReplayFrame(engine.clock, engine.aircraft(Date.now()), engine.openEvents());
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run`
Expected: PASS (whole web suite).

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add apps/web/store/aircraftStore.ts apps/web/components/recorded/RecordedView.tsx apps/web/test/incidentReplay.test.ts apps/web/test/alertsStore.test.ts
git commit -m "feat(web): alerts for flights watched in a recorded replay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: System notifications (`lib/notify.ts`)

**Files:**
- Create: `apps/web/lib/notify.ts`
- Test: `apps/web/test/notify.test.ts`

**Interfaces:**
- Consumes: `type Alert` (Task 1).
- Produces:
  - `notificationPermission(): NotificationPermission | "unsupported"`
  - `requestNotifications(): Promise<NotificationPermission | "unsupported">`
  - `showNotification(alert: Alert, onClick: () => void): boolean` (true when shown)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/notify.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "../lib/alerts";
import { notificationPermission, requestNotifications, showNotification } from "../lib/notify";

const alert: Alert = { id: "e1:open", eventId: "e1", hex: "7c6db7", kind: "landing", title: "QFA520 landed", body: "b", at: 0, mode: "live" };

function fakeNotification(permission: NotificationPermission, opts: { throws?: boolean } = {}) {
  const created: { title: string; options?: NotificationOptions }[] = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    onclick: (() => void) | null = null;
    constructor(title: string, options?: NotificationOptions) {
      if (opts.throws) throw new TypeError("Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.");
      created.push({ title, options });
    }
    close() {}
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { created, FakeNotification };
}

afterEach(() => vi.unstubAllGlobals());

describe("notify", () => {
  it("reports unsupported when there is no Notification API", () => {
    vi.stubGlobal("Notification", undefined);
    expect(notificationPermission()).toBe("unsupported");
    expect(showNotification(alert, () => {})).toBe(false);
  });

  it("shows one notification tagged with the alert id when granted", () => {
    const { created } = fakeNotification("granted");
    expect(showNotification(alert, () => {})).toBe(true);
    expect(created).toEqual([{ title: "QFA520 landed", options: { body: "b", tag: "e1:open" } }]);
  });

  it("does nothing without permission", () => {
    const { created } = fakeNotification("default");
    expect(showNotification(alert, () => {})).toBe(false);
    expect(created).toEqual([]);
  });

  it("returns false instead of throwing where the constructor isn't allowed (Chrome on Android)", () => {
    fakeNotification("granted", { throws: true });
    expect(showNotification(alert, () => {})).toBe(false);
  });

  it("asks for permission", async () => {
    fakeNotification("default");
    expect(await requestNotifications()).toBe("granted");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run test/notify.test.ts`
Expected: FAIL with "Cannot find module '../lib/notify'".

- [ ] **Step 3: Implement `lib/notify.ts`**

```ts
import type { Alert } from "./alerts";

// System notifications for alerts, while AeroTrack is open. Every call is failure-proof:
// unsupported browsers, denied permission and constructors that throw (Chrome on Android
// only allows service-worker notifications) all mean "in-page alerts only".

interface NotificationApi {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): Notification;
}

function api(): NotificationApi | null {
  const N = (globalThis as { Notification?: unknown }).Notification;
  return typeof N === "function" ? (N as NotificationApi) : null;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return api()?.permission ?? "unsupported";
}

export async function requestNotifications(): Promise<NotificationPermission | "unsupported"> {
  const N = api();
  if (!N) return "unsupported";
  try {
    return await N.requestPermission();
  } catch {
    return "denied";
  }
}

/** True when a notification was shown. The tag stops the same alert showing twice. */
export function showNotification(alert: Alert, onClick: () => void): boolean {
  const N = api();
  if (!N || N.permission !== "granted") return false;
  try {
    const n = new N(alert.title, { body: alert.body, tag: alert.id });
    n.onclick = () => {
      globalThis.focus?.();
      onClick();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run test/notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add apps/web/lib/notify.ts apps/web/test/notify.test.ts
git commit -m "feat(web): system notifications for alerts, failing safe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Watch button, chips, toasts, alerts menu and permission banner

**Files:**
- Create: `apps/web/components/follow/WatchButton.tsx`; delete `apps/web/components/follow/FollowButton.tsx`
- Modify: `apps/web/components/panel/DetailsPanel.tsx:19,88,129`
- Modify: `apps/web/components/follow/FollowingList.tsx`
- Create: `apps/web/components/alerts/AlertToasts.tsx`, `AlertsMenu.tsx`, `NotifyBanner.tsx`
- Modify: `apps/web/components/LiveView.tsx`, `apps/web/components/recorded/RecordedView.tsx` (mount)

**Interfaces:**
- Consumes: store `watched`, `replayWatch`, `watch`, `unwatch`, `alerts`, `unreadAlerts`, `markAlertsRead`, `focusOn`, `mode` (Tasks 3-4); `followFlight`, `unfollowFlight` from `lib/api`; `notificationPermission`, `requestNotifications`, `showNotification` (Task 5); `THRESHOLDS.alerts`.
- Produces: UI only.

These are thin components over tested logic; verification is the browser check in Step 7.

- [ ] **Step 1: `WatchButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { followFlight, unfollowFlight } from "../../lib/api";
import { useAircraftStore } from "../../store/aircraftStore";

const FULL = "You're watching as many flights as AeroTrack can follow at once (10). Stop watching one first.";

/** Watch a flight for alerts. Live: also follows it on the server so it's tracked worldwide (option A). */
export function WatchButton({ hex }: { hex: string }) {
  const recorded = useAircraftStore((s) => s.mode === "recorded");
  const watching = useAircraftStore((s) => (s.mode === "recorded" ? s.replayWatch : s.watched).includes(hex));
  const watch = useAircraftStore((s) => s.watch);
  const unwatch = useAircraftStore((s) => s.unwatch);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    setMessage(null);
    if (watching) {
      unwatch(hex);
      if (!recorded) {
        setBusy(true);
        const r = await unfollowFlight(hex);
        setBusy(false);
        if (!r.ok) setMessage(r.message);
      }
      return;
    }
    if (!recorded) {
      setBusy(true);
      const r = await followFlight(hex);
      setBusy(false);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
    }
    if (!watch(hex, Date.now() / 1000)) setMessage(FULL);
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching}
        className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
          watching ? "border border-sky/50 text-sky hover:bg-sky/10" : "bg-sky text-navy hover:bg-sky/90"
        }`}
      >
        {busy ? "One moment…" : watching ? "🔔 Watching · Stop watching" : "Watch this flight"}
      </button>
      <p className="mt-1.5 text-xs text-muted">
        {watching ? "You'll get an alert when it takes off, lands, circles or stops reporting." : "Get calm, plain-English alerts while AeroTrack is open."}
      </p>
      {message && <p className="mt-2 text-sm text-text/90">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Use it in `DetailsPanel.tsx`**

Replace `import { FollowButton } from "../follow/FollowButton";` with `import { WatchButton } from "../follow/WatchButton";`. Replace `<FollowButton hex={hex} />` (line ~88, overview variant) with `<WatchButton hex={hex} />`, and replace `{!recorded && <FollowButton hex={hex} />}` (line ~129) with `<WatchButton hex={hex} />` so it also shows in recordings. Delete `components/follow/FollowButton.tsx` (`git rm`). Run `pnpm --filter web typecheck` to confirm nothing else imported it.

- [ ] **Step 3: 🔔 and unwatch in `FollowingList.tsx`**

Add `const watched = useAircraftStore((s) => s.watched);` and `const unwatch = useAircraftStore((s) => s.unwatch);` beside the other selectors. In `stop(hex)`, call `unwatch(hex);` before `await unfollowFlight(hex)`. In the chip's first button, render `{watched.includes(f.hex) && <span aria-label="watching">🔔 </span>}` before `{name}`.

- [ ] **Step 4: `AlertToasts.tsx`**

```tsx
"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { useEffect, useState } from "react";
import type { Alert } from "../../lib/alerts";
import { showNotification } from "../../lib/notify";
import { useAircraftStore } from "../../store/aircraftStore";

/** New alerts as toasts (top right) and, when allowed, system notifications. */
export function AlertToasts() {
  const [toasts, setToasts] = useState<Alert[]>([]);
  const focusOn = useAircraftStore((s) => s.focusOn);

  useEffect(
    () =>
      useAircraftStore.subscribe((s, prev) => {
        if (s.alerts === prev.alerts) return;
        const known = new Set(prev.alerts.map((a) => a.id));
        const fresh = s.alerts.filter((a) => !known.has(a.id));
        if (!fresh.length) {
          if (!s.alerts.length) setToasts([]); // mode switch or seek back cleared the list
          return;
        }
        for (const a of fresh) {
          showNotification(a, () => useAircraftStore.getState().focusOn(a.hex));
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), THRESHOLDS.alerts.toastMs);
        }
        setToasts((t) => [...fresh, ...t].slice(0, THRESHOLDS.alerts.maxToasts));
      }),
    [],
  );

  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="pointer-events-none absolute right-3 top-3 z-30 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2">
      {toasts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => focusOn(a.hex)}
          className="pointer-events-auto rounded-xl border border-sky/30 bg-navy/95 p-3 text-left text-sm text-text shadow-lg hover:bg-white/5"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">🔔 {a.title}</span>
            {a.mode !== "live" && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">Recorded</span>}
          </span>
          <span className="mt-1 block text-text/85">{a.body}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `AlertsMenu.tsx` and `NotifyBanner.tsx`**

`AlertsMenu.tsx`:

```tsx
"use client";

import { DISPLAY_TIME_ZONE } from "@aerotrack/shared";
import { useState } from "react";
import { useAircraftStore } from "../../store/aircraftStore";

const time = new Intl.DateTimeFormat("en-AU", { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** Bell with unread count, and this visit's alerts. */
export function AlertsMenu() {
  const alerts = useAircraftStore((s) => s.alerts);
  const unread = useAircraftStore((s) => s.unreadAlerts);
  const markAlertsRead = useAircraftStore((s) => s.markAlertsRead);
  const focusOn = useAircraftStore((s) => s.focusOn);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          markAlertsRead();
        }}
        aria-expanded={open}
        aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
        className="rounded-full bg-navy/90 px-3 py-1.5 text-sm text-text shadow-lg hover:bg-white/5"
      >
        🔔{unread > 0 && <span className="ml-1 rounded-full bg-sky px-1.5 text-xs font-semibold text-navy">{unread}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-navy/95 p-2 text-sm text-text shadow-lg">
          {alerts.length === 0 ? (
            <p className="px-2 py-2 text-muted">No alerts yet. Watch a flight to get them here.</p>
          ) : (
            <ol className="max-h-80 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => focusOn(a.hex)} className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/5">
                    <span className="flex justify-between gap-2">
                      <span className="font-medium">{a.title}</span>
                      <span className="shrink-0 text-xs text-muted">{time.format(new Date(a.at * 1000))}</span>
                    </span>
                    <span className="block text-xs text-text/80">{a.body}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-1 border-t border-white/10 px-2 pt-2 text-xs text-muted">
            AeroTrack is informational only. Alerts work while AeroTrack is open. For official flight status, contact the airline.
          </p>
        </div>
      )}
    </div>
  );
}
```

`NotifyBanner.tsx`:

```tsx
"use client";

import { useState } from "react";
import { notificationPermission, requestNotifications } from "../../lib/notify";
import { useAircraftStore } from "../../store/aircraftStore";

/** One calm offer to turn on system notifications, after the first watch. */
export function NotifyBanner() {
  const watchingAny = useAircraftStore((s) => s.watched.length + s.replayWatch.length > 0);
  const [dismissed, setDismissed] = useState(false);
  const [permission, setPermission] = useState<string | null>(null);
  const current = permission ?? (watchingAny ? notificationPermission() : "unsupported");
  if (!watchingAny || dismissed || current !== "default") return null;

  return (
    <div role="dialog" aria-label="Notifications" className="absolute bottom-24 left-1/2 z-30 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-sky/30 bg-navy/95 p-3 text-sm text-text shadow-lg">
      <p>Get a notification when something changes, even if AeroTrack is in another tab?</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={async () => setPermission(await requestNotifications())} className="rounded-lg bg-sky px-3 py-1.5 font-medium text-navy hover:bg-sky/90">
          Turn on
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="rounded-lg px-3 py-1.5 text-sky hover:bg-white/5">
          Not now
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Mount them**

In `LiveView.tsx` and `RecordedView.tsx`: import the three components; put `<div className="pointer-events-auto"><AlertsMenu /></div>` in the header right after the `ModeBadge` wrapper; put `<AlertToasts />` and `<NotifyBanner />` just before `<DetailsPanel />`. The details panel sits on the right, so toasts (`right-3 top-3`, `z-30`) overlay its top edge briefly; that's acceptable for 8 s.

- [ ] **Step 7: Verify in the browser**

Run checks: `pnpm typecheck && pnpm test && pnpm lint`. With the dev servers running (`pnpm --filter api dev`, `pnpm --filter web dev`):
1. Open http://localhost:3000/recorded/2024-11-08-return-to-sydney-soon-after-take-off, select QFA520, press "Watch this flight". Expect the button to read "🔔 Watching · Stop watching" and the banner to appear.
2. Press "Turn on" and allow. Set 20x from the start. Expect toasts "QFA520 took off", "QFA520 is circling" (with "about N km south… of Sydney Kingsford Smith International Airport"), "QFA520 landed", each with a "Recorded" chip, plus system notifications. The bell count rises; opening the list shows all three and the footer.
3. Drag the slider back to the start: the list empties and alerts repeat on the way forward.
4. Click "Back to live": no alerts, no replay watch. Select a live aircraft, watch it, check the chip shows 🔔, then press × on the chip: chip and watch both gone.
5. Phone width (390 px): toasts and bell don't overflow; no horizontal scroll.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/components
git commit -m "feat(web): watch flights and see alerts as toasts, notifications and a list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/SPEC.md` (section 12, new subsection after 12.6; section 2 P1 list; section 20)
- Modify: `README.md` ("What it does", "Known limitations")

- [ ] **Step 1: Spec**

Add after section 12.6:

```markdown
### 12.8 Flight alerts (P1, hackathon pitch)
- Design: `docs/superpowers/specs/2026-10-18-flight-alerts-design.md`. For people waiting on a flight: calm, plain-English alerts while AeroTrack is open.
- "Watch this flight" in the panel (live: browser watch list `aerotrack.watch.v1` plus the shared follow; recorded: memory only). 🔔 on watched chips.
- Alerts on: took off, landed, circling, signal lost and back, emergency code, rapid descent. Never on climbs, descents, turns, gaps or glitches. Only events opened within `alerts.backfillSec` of watching or page load.
- Toasts (8 s, at most 3), a bell list for the visit, system notifications when allowed (tagged by alert id). Recorded alerts are labelled "Recorded" and cleared on mode switch.
- Not push: nothing arrives with AeroTrack closed (roadmap: Web Push).
```

Add "Flight alerts for watched flights (12.8)" to the P1 list in section 2, and "Alerts only work while AeroTrack is open; anyone can remove a flight from the shared follow list" to section 20.

- [ ] **Step 2: README**

Under "What it does", add after the "Follow a flight" bullet:

```markdown
- **Alerts for people waiting on a flight**: watch a flight and get calm, plain-English alerts when it takes off, lands, circles (for example while waiting to land), stops reporting or squawks an emergency code, as a toast and, if you allow it, a system notification. Works in recordings too.
```

Under "Known limitations", add:

```markdown
- Alerts only arrive while AeroTrack is open in a tab (no push notifications yet). The follow list is shared, so anyone can stop worldwide tracking of a flight.
```

- [ ] **Step 3: Final checks and commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add docs/SPEC.md README.md
git commit -m "docs: describe flight alerts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
