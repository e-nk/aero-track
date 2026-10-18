# Flight alerts for people waiting on a flight: design

Date: 2026-10-18. Status: approved in conversation, awaiting written review.

## Purpose

AeroTrack is being demoed at a hackathon judged on (a) how AI was used to build it and (b) whether it solves a real pain point.

**Pain point:** someone whose person is on a plane watches a flight tracker, and when the flight holds, circles, loses signal or squawks, they see a dot going in circles plus jargon, and panic or refresh endlessly.

**Pitch:** "Flightradar24 shows a dot going in circles. AeroTrack tells you, calmly and honestly, what your person's flight is doing, and lets you stop staring at the map."

**Success:** in the demo, the presenter watches a flight in a recording (QF520, 8 Nov 2024) and alerts appear on cue, in plain English, for take-off, the holding pattern and landing, without stating causes or alarming anyone.

## Decisions

| Question | Decision |
| --- | --- |
| Delivery | In the browser while AeroTrack is open: an in-page toast, plus a system notification when allowed. Push notifications with the tab closed are the roadmap, not this build. |
| Alert kinds | All of: took off, landed, started circling, signal lost and back, emergency code, rapid descent. |
| Whose flights | Option A: a personal watch list kept in the browser, on top of the existing shared follow list (live watching also follows the flight so it is tracked worldwide). Known weakness: anyone can remove a flight from the shared follow list, which stops worldwide tracking for everyone. |
| Where alerts come from | In the browser, from events the app already receives (live stream and replay engine). No server changes. |

## What the user sees

- **Watch button.** The panel's follow button becomes "Watch this flight" / "Watching · Stop watching".
  - Live: watching adds the hex to the browser's watch list and follows it on the server (as today). Stopping removes it from the watch list and unfollows it.
  - Recorded: watching only adds it to an in-memory replay watch list. No server call.
- **Chips.** Following chips show 🔔 on flights this browser watches. The × (stop following) also removes the hex from the watch list.
- **Permission banner.** The first time a flight is watched and notification permission is still "default", a calm banner offers: "Get a notification when something changes, even if AeroTrack is in another tab?" with "Turn on" and "Not now". If dismissed or denied, alerts still appear in the page. It is not shown again during the visit after "Not now".
- **Toasts.** Top right, one per alert, auto-dismiss after 8 seconds, at most 3 visible (older ones collapse into the list). Clicking one flies the map to the flight and selects it.
- **Alerts list.** A bell button in the header with an unread count. It opens a list of this visit's alerts, newest first, with times. Opening it clears the unread count. Footer: "AeroTrack is informational only. Alerts work while AeroTrack is open. For official flight status, contact the airline."
- **Mode badge rule.** In a recording, toasts and list items carry "Recorded" so they can't be mistaken for live news. Switching mode clears the list and the replay watch list (rule 3: modes never mix).

## Alert wording

`{name}` is the callsign, else the registration, else the hex. Times use the Sydney clock format already used by explanations. Wording never states a cause (rule 8).

| Trigger | Title | Body |
| --- | --- | --- |
| `takeoff` opens | `{name} took off` | `{name} took off {where} at {time}.` |
| `landing` opens | `{name} landed` | `{name} landed {where} at {time}.` |
| `circling` opens | `{name} is circling` | `{name} has been circling {place}for about {minutes}. Aircraft commonly do this while waiting to land. The data doesn't show why.` |
| `signal_lost` opens | `No new position for {name}` | `We haven't had a position for {name} for {duration}. This is common over the ocean, where there are few receivers.` |
| `signal_lost` closes | `Tracking {name} again` | `New positions for {name} are arriving again.` |
| `emergency` opens | `{name} is transmitting an emergency code` | `Crews use these codes to get priority help, and many such flights land normally. The data doesn't show why. Check with the airline for official information.` |
| `rapid_descent` opens | `{name} is descending faster than usual` | `About {peakRateFpm} ft per minute. The data doesn't show why. Check with the airline for official information.` |

- `{where}`: reuses the take-off and landing explanation's place phrase ("near Sydney Kingsford Smith International Airport", or "away from any airport in our list").
- `{place}`: "about 25 km south of Sydney Kingsford Smith International Airport " only when the aircraft's position at the moment of the alert (live store or replay engine; circling evidence has no coordinates) is within 60 km of an airport in the shipped Sydney-region list; otherwise empty. Never guessed. `alertsForChanges` takes a `position: (hex) => { lat, lon } | undefined` input for this.
- Values come from the event's evidence. A missing value renders "Not available" via the existing formatters, never invented (rule 2).

## How it works

### New and changed modules (all in `apps/web`)

- `lib/watchlist.ts`
  - `createWatchlist(storage?: Storage)` with `has`, `add`, `remove`, `list`. Live list persisted under `aerotrack.watch.v1` (JSON array of hexes, max 10, matching `thresholds.follow.maxFollowed`). Every storage access is wrapped in try/catch; on failure it works in memory for the visit.
  - Replay watches: a plain in-memory `Set` in the store, never persisted.
- `lib/alerts.ts` (pure, no DOM)
  - `type Alert = { id: string; eventId: string; hex: string; kind: AlertKind; title: string; body: string; at: number; mode: DataMode }`.
  - `alertsForChanges(input: { opened: BehaviourEvent[]; closed: BehaviourEvent[]; watched: ReadonlySet<string>; since: (hex) => number; identity: (hex) => { callsign, registration } | undefined; position: (hex) => { lat, lon } | undefined; mode: DataMode; timeZone: string }): Alert[]`.
  - Rules: only watched hexes; only events whose `openedAt >= since` (where `since` is the later of page load and when that hex was watched, minus 120 s); only the opened kinds in the table, plus `signal_lost` in `closed`; never from updates. Alert `id` is `${eventId}:${open|close}` so it is unique and stable.
- `lib/notify.ts`: `notificationsSupported()`, `permission()`, `requestPermission()`, `show(alert, onClick)`. Uses `new Notification(title, { body, tag: alert.id })`. A no-op when unsupported or not granted.
- `lib/sse.ts`: `event_open` gets its own handler (`onEventOpen`) instead of sharing `onEventUpsert`, so the store knows what is new. `event_update` keeps `onEventUpsert`.
- `store/aircraftStore.ts`:
  - New state: `alerts: Alert[]`, `unreadAlerts: number`, `replayWatch: Set<string>`, `watchSince: Record<string, number>`.
  - Live: `onEventOpen` stores the event, then runs `alertsForChanges` with it as `opened`. `onEventClose` looks up the event (and its type) in `events` before removing it, and passes it as `closed`.
  - Replay: `setReplayFrame` receives the frame's lifecycle changes from `RecordedView`, and runs `alertsForChanges` with the replay watch list. Seeking backwards resets the replay alerts.
  - Seeded events (`applyEventsSeed`, from the details fetch) never alert.
  - `startRecorded` and `reset` clear `alerts`, `unreadAlerts`, `replayWatch` and `watchSince`.
- Components: `follow/WatchButton.tsx` (replaces `FollowButton`), `alerts/AlertToasts.tsx`, `alerts/AlertsMenu.tsx` (bell, count, list), `alerts/NotifyBanner.tsx`; `FollowingList.tsx` gains the 🔔 and removes from the watch list on ×.

### Data flow

- Live: SSE `event_open` / `event_close` → store → `alertsForChanges` → `alerts` list → toasts, and `notify.show` for every alert when permission is granted (the tag prevents duplicates). Followed flights outside the Sydney area go through the same api pipeline and stream (`handlePoll` in `apps/api/src/index.ts`), so their alerts work the same way.
- Replay: `ReplayEngine.advanceTo` changes → `setReplayFrame` → same function and UI, `mode: "recorded"`.

### Not changing

The api, the detectors, the database and the SSE message formats. Thresholds are unchanged except the two alert constants, which go in `packages/shared/src/config/thresholds.ts` (rule 4): `alerts: { backfillSec: 120, placeWithinKm: 60, toastMs: 8000, maxToasts: 3 }`.

## Error handling

- Notifications unsupported, denied or blocked: in-page alerts only. The banner isn't shown when unsupported or denied.
- Storage unavailable: watching works for the visit and isn't remembered.
- Live stream reconnects: events that opened while disconnected and are older than `backfillSec` are not alerted (the 120 s window covers a short reconnect).
- A watched flight that is no longer reported: the signal-lost alert covers it. If the shared follow is removed by someone else, the next details fetch shows it isn't followed; the 🔔 chip disappears with the follow.

## Testing (tests first)

- `test/alerts.test.ts`:
  - each kind's exact title and body, including "Not available" for missing values and the `{place}` rule (inside and outside 60 km)
  - only watched hexes; nothing for `event_update`; the backfill window; `signal_lost` close gives "Tracking … again"; stable alert ids
- `test/watchlist.test.ts`: add, remove, the 10 limit, persistence round trip, storage that throws.
- `test/liveState.test.ts` or a store test: seeded events never alert; `reset` clears alerts.
- `test/incidentReplay.test.ts`: watching `7c6db7` in the QF520 recording yields alert kinds `takeoff`, `circling`, `landing` in that order, all `mode: "recorded"`, and no emergency alert.
- Browser check: watch a flight in the QF520 replay at 20x, see the three toasts and the list; allow notifications and see a system notification.

## Out of scope

Push notifications with the tab closed, email or SMS, accounts, per-user server-side follows (option B), alerting on climbs, descents and turns.
