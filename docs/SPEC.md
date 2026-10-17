# AeroTrack Technical Specification

Version 1.0 · Based on PRD v1.1 · Name may change (alias: FlightSense)

Tagline: Understand the journey, not just the destination.
Principle: AeroTrack is never more confident than its data.

---

## 1. Product summary

A responsive web flight tracker for Sydney that explains observable aircraft behaviour in plain English: climbing, descending, turning, circling, rapid descent, lost signal, data glitches and track gaps. It separates facts from possible interpretations and never infers causes.

Users:
- Primary: travellers and friends/family following a flight. Want reassurance and plain language.
- Secondary: casual aviation enthusiasts.
- Out of scope: pilots, ATC, airline ops, any safety-critical use.

## 2. Scope

### P0 (must)
- Responsive shell, desktop side panel, simple mobile panel
- MapLibre map (OpenFreeMap online, PMTiles offline)
- Aircraft markers, selection, details panel (available fields only)
- Backend poller for adsb.lol, shared by all clients
- Live/recorded mode toggle and badge
- Recorded flight replay, working fully offline
- Detectors: sustained climb, sustained descent, sustained turn, signal lost, glitch handling, gap handling
- Detector test suite

### P1 (should)
- Possible circling
- Rapid descent
- Emergency code
- Event timeline per aircraft
- Callsign search, plus flight number to callsign via airline prefix (QF1 to QFA1)
- Airline and aircraft-type filters
- Loading, error and empty states
- One recorded past incident from the ADSB.lol globe_history archive
- Take-off and landing events near known airports (9.11)
- "Seen by AeroTrack" counts per aircraft, from our own observations (11.9)
- Aircraft photo from Planespotters.net, with photographer credit (5.7)
- Altitude display: GPS altitude when available, else labelled pressure altitude (12.4)
- Australia-wide overview layer from the OpenSky Network, about every 90 s, no insights (5.8, 11.10)
- Follow a flight worldwide via adsb.lol multi-hex lookups, up to 10 at once, destination only when observed (5.1, 11.11)

### P2 (if time)
- LLM phrasing layer (input: detector output only)
- Natural-language search (LLM parses to structured filters)
- Visual polish

### Cut (do not build)
- Metadata-only flight preview, ADSBdb integration
- Route lines, domestic/international filter. If routes ever appear, label "typical route for this callsign"
- Mixed live/sample view, airport search, filter persistence, polished bottom sheet
- ETA, destination or arrival-time predictions. We don't know where a flight is going, so any ETA would rest on an invented route (rule 2).
- Accounts (open question, see section 16)

## 3. Architecture

```
adsb.lol ──(poll 5-10 s, server only)──► apps/api (Railway)
                                           │
                     adapter + Zod ────────┤
                                           ▼
                           in-memory ring buffer per aircraft (15 min)
                                           │
                       packages/detectors ─┤ (open/update/close events)
                                           │
              batched writes ─► Postgres (positions 24 h, events, recordings)
                                           │
                                SSE stream ─► apps/web (Vercel) ─► MapLibre

Recorded mode (online or offline):
  recording JSON (api from Postgres, or /public offline) ─► apps/web replay engine
                                     └► packages/detectors IN THE BROWSER
```

Key decisions:
- Detectors are shared TS so the same rules run on live data (server) and on replays (browser). This is what makes offline replay possible.
- SSE comes from Railway, not Vercel. Vercel functions are short-lived and unsuited to long-lived connections.
- Detectors read the in-memory buffer. Postgres is for persistence, restarts and recordings.
- Single api instance. No Redis needed at this stage.

## 4. Repository layout

```
aerotrack/
  CLAUDE.md
  docs/SPEC.md
  package.json            # workspace root, scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  apps/
    web/
      app/
        page.tsx                 # live map
        recorded/[id]/page.tsx   # recorded replay
        layout.tsx
      components/
        map/AircraftMap.tsx
        map/aircraftLayer.ts
        map/trackLayer.ts
        panel/DetailsPanel.tsx
        panel/EventCard.tsx
        panel/Timeline.tsx
        ModeBadge.tsx
        SearchBar.tsx
        Filters.tsx
        StatusBanner.tsx
      lib/
        sse.ts                   # EventSource client + reconnect
        interpolate.ts           # dead reckoning between updates
        replay/engine.ts         # client-side replay
        mapStyle.ts              # online vs offline style
      store/aircraftStore.ts     # Zustand
      public/
        offline/sydney.pmtiles   # offline only, gitignored if large
        offline/fonts/...
        offline/sprites/...
        recordings/*.json
    api/
      src/
        index.ts                 # Fastify bootstrap
        env.ts                   # Zod-validated env
        providers/adsblol/client.ts
        providers/adsblol/schema.ts
        providers/adsblol/adapter.ts
        poller.ts
        buffer.ts                # ring buffer per hex
        eventEngine.ts           # runs detectors, manages lifecycle
        writer.ts                # batched DB writes
        sse.ts                   # client registry + broadcast
        routes/*.ts
        db/schema.ts             # Drizzle
        db/client.ts
        jobs/retention.ts
      drizzle/                   # migrations
  packages/
    shared/
      src/types.ts
      src/schemas.ts
      src/config/thresholds.ts
      src/airlines.ts            # IATA to ICAO prefix map
    detectors/
      src/preprocess.ts
      src/climbDescent.ts
      src/turn.ts
      src/circling.ts
      src/rapidDescent.ts
      src/signalLost.ts
      src/emergency.ts
      src/glitch.ts
      src/gaps.ts
      src/explain.ts             # templates
      src/index.ts               # runAll(track, ctx) -> Detection[]
      test/fixtures/*.ts
      test/*.test.ts
  scripts/
    export-recording.ts          # moved to apps/api/scripts/export-recording.ts (needs the db): pnpm --filter api recording:export
    import-globe-history.ts      # archive trace -> recording JSON
    build-airlines.ts            # OpenFlights -> airlines.ts
```

## 5. External APIs and data sources

### 5.1 ADSB.lol live API (primary, P0)

- Base URL: `https://api.adsb.lol`
- Interactive docs: `https://api.adsb.lol/docs` (OpenAPI at `/api/openapi.json`). Verified 2026-10-17. Raw sample: `docs/samples/adsblol-point.json`.
- Auth: none as of 2026-10-17. The API docs say a key will be required in future, obtained by feeding adsb.lol. Keep `ADSB_BASE_URL` and an optional `ADSB_API_KEY` in env so a key can be added without code changes.
- REQUIRED: send a `User-Agent` header on every request. Requests without one get 403 (verified). Node's fetch does not set one by default.
  - `User-Agent: AeroTrack/0.1 (+contact email)`
- Rate limits: dynamic and not published ("dynamic based on the environment load", adsblol/api README). A 429 comes back as an nginx HTML page with no `Retry-After` header (seen after ~12 requests in ~10 s). The client must treat any non-JSON or 429 response as a failure and apply the §11.1 backoff. Tests never call the real API; use saved samples.

Endpoints (v2):

| Purpose | Endpoint |
|---|---|
| Aircraft near a point (radius in nautical miles, max 250; larger values are clamped, not rejected) | `GET /v2/point/{lat}/{lon}/{radius}` |
| Same, alternate form | `GET /v2/lat/{lat}/lon/{lon}/dist/{radius}` |
| Single closest aircraft to a point | `GET /v2/closest/{lat}/{lon}/{radius}` |
| By ICAO hex | `GET /v2/hex/{hex}` (alias `/v2/icao/{hex}`) |
| By callsign | `GET /v2/callsign/{callsign}` |
| By registration | `GET /v2/reg/{reg}` (alias `/v2/registration/{reg}`) |
| By type designator | `GET /v2/type/{type}` |
| By squawk | `GET /v2/squawk/{squawk}` (alias `/v2/sqk/{squawk}`) |

Also listed but unused: `/v2/mil`, `/v2/ladd`, `/v2/pia`, `/api/0/airport/{icao}`, `/0/me`.

Several aircraft in one request (verified 2026-10-17): `GET /v2/hex/{hex1},{hex2},...` returns each aircraft wherever adsb.lol has coverage (worldwide). Used for followed flights (11.11).

Our poll: `GET /v2/point/-33.9/151.0/60` every 10 s (configurable, minimum 5 s). One request serves all clients. At 7 s we saw a 429 every 1-2 minutes on 2026-10-17, so 10 s is the default.

Response envelope (verified):
```json
{ "ac": [ ... ], "msg": "No error", "now": 1760684400123, "total": 142, "ctime": 1760684400100, "ptime": 3 }
```
- `now` is epoch milliseconds.

Aircraft object fields we use (readsb format, all optional except `hex`; verified 2026-10-17):

| Field | Type | Meaning | Notes |
|---|---|---|---|
| `hex` | string | ICAO 24-bit address | Primary key. May start with `~` for non-ICAO (TIS-B). Keep as-is |
| `type` | string | Position source: `adsb_icao`, `adsb_icao_nt`, `mlat`, `tisb_*`, ... | NOT the aircraft type. Don't confuse with `t` |
| `flight` | string | Callsign | Space-padded. `trim()` it |
| `r` | string | Registration | |
| `t` | string | ICAO type designator, e.g. B738 | |
| `category` | string | Emitter category A0-A7, B*, C* | A7 = rotorcraft. A0 = no info (common). C1-C7 = ground vehicles and obstacles: the adapter drops them, they are not aircraft. Towers also appear (type `TWR`, no category, e.g. `SSM1`); the adapter drops those too |
| `alt_baro` | number or `"ground"` | Barometric altitude, ft | `"ground"` means on ground |
| `alt_geom` | number | Geometric altitude, ft | Not used as a fallback for `alt_baro`: never mix baro and geometric altitude in one track |
| `gs` | number | Ground speed, kt | |
| `track` | number | True track over ground, degrees | Use for turns. Often missing on the ground |
| `baro_rate` | number | Vertical rate, ft/min | Prefer over geom_rate |
| `geom_rate` | number | Geometric vertical rate | Fallback |
| `squawk` | string | Transponder code | String, keep leading zeros |
| `emergency` | string | `none`, `general`, `lifeguard`, `minfuel`, `nordo`, `unlawful`, `downed`, `reserved` | Often absent (17 of 25 in the sample). Absent means "Not available", not `none` |
| `lat`, `lon` | number | Position | May be absent (all present in the point sample) |
| `seen_pos` | number | Seconds since last position update | Can approach 60 s: the response includes stale positions |
| `seen` | number | Seconds since any message | |
| `mlat`, `tisb` | string[] | Names of fields derived via MLAT/TIS-B | Always present, usually empty arrays |
| `dst`, `dir` | number | Distance and bearing from query point | Point queries only |

Not used: `desc` does not exist in the live API (it appears only in archive traces). Many extra fields appear (`ias`, `tas`, `mach`, `true_heading`, `nav_*`, `calc_track`, `dbFlags`, ...); the Zod schema passes them through.

Position timestamp: `posTs = now/1000 - seen_pos` (seconds). Always store this, not receipt time.

Aircraft disappear from the response once stale (around 60 s after the last position). The server must track `lastPosTs` per hex itself to detect signal loss. Because this sits right at `signalLost.afterSec`, expect flapping and tune that threshold on recorded data.

Optional route lookup (cut from MVP, documented for later):
- `POST https://api.adsb.lol/api/0/routeset`
- Body: `{ "planes": [ { "callsign": "QFA1", "lat": -33.9, "lng": 151.1 } ] }`
- Meant to return plausible origin/destination airports. On 2026-10-17 it returned 201 with an empty body (the OpenAPI says 200 with a string). Treat as unreliable. If used, label "typical route for this callsign".

### 5.2 ADSB.lol globe_history archive (P1, recorded incident)

- Repos (verified 2026-10-17): `adsblol/globe_history_2026` (also `_2023`, `_2024`, `_2025`). Format docs: wiedehopf/readsb `README-json.md#trace-jsons`.
- Licence: ODbL. Attribute "Data: ADSB.lol (ODbL)".
- One GitHub release per day, tagged `v<YYYY.MM.DD>-planes-readsb-prod-0` (also `-staging-0`, and a small `-mlatonly-0`). Use prod; use staging only if prod is missing or much smaller.
- Each release is a tar split into `.tar.aa` (2.0 GB) and `.tar.ab` (~1.8 GB), about 3.8 GB per day. Never fetch from the app or CI. Use `scripts/import-globe-history.ts` once, offline.
- Extract: `cat v<date>-planes-readsb-prod-0.tar.aa v<date>-planes-readsb-prod-0.tar.ab | tar -xf - -C <dir>`. To avoid storing 3.8 GB, stream both parts and extract one member: `(curl -sL <aa-url>; curl -sL <ab-url>) | tar -xf - ./traces/<xx>/trace_full_<hex>.json`.
- Inside: `./traces/<last 2 hex chars>/trace_full_<hex>.json` (verified; `~` hexes included). Also a `heatmap/` directory we don't use.
- **Trace files are gzip-compressed despite the `.json` extension.** Gunzip before parsing.
- Trace format (readsb, verified on a real file):
```json
{
  "icao": "7c4a56",
  "r": "VH-OYW", "t": "A21N", "desc": "AIRBUS A-321neo", "ownOp": "...", "year": "2024", "dbFlags": 0,
  "version": "readsb 3.16.15 05df27d",
  "timestamp": 1792108800.0,
  "trace": [
    [15546.73, -29.609318, 152.352474, 36000, 417.5, 197.6, 0, 0, { "type": "adsb_icao", "flight": "JST656  ", "squawk": "1055", "category": "A3" }, "adsb_icao", 37250, -32, 260, 0.0]
  ]
}
```
  - Top level: `timestamp` is midnight UTC of the archive day. `r`, `t`, `desc`, `ownOp`, `year`, `dbFlags` may be present.
  - Every point has 14 elements:
  - index 0: seconds offset from `timestamp`
  - 1-2: lat, lon
  - 3: altitude ft, `"ground"` or `null`
  - 4: ground speed kt or null
  - 5: track deg or null (true heading instead when index 3 is `"ground"`)
  - 6: flags bitfield: `&1` stale position (none for 20 s before this one), `&2` start of a new leg, `&4` vertical rate is geometric, `&8` altitude is geometric
  - 7: vertical rate fpm or null
  - 8: aircraft details object (readsb aircraft.json fields, e.g. `flight`, `squawk`, `emergency`, `category`) or null. Only present on some points; carry the last seen values forward
  - 9: source / type string or null
  - 10: geometric altitude or null
  - 11: geometric vertical rate or null
  - 12: indicated airspeed or null
  - 13: roll angle or null
- Import rules: points with flag `&8` have geometric, not barometric, altitude, and `&4` means geometric vertical rate. Either drop those values (set to null) or keep them consistently; never mix baro and geometric values in one track silently.
- Script output: recording JSON (section 8).

### 5.3 Map tiles

Online (P0): OpenFreeMap
- Style URL: `https://tiles.openfreemap.org/styles/liberty` (verified; tiles send `access-control-allow-origin: *`)
- Dark styles (verified 2026-10-17): `https://tiles.openfreemap.org/styles/fiord` (blue-grey `#45516E` background, closest to the aviation palette, default candidate) and `https://tiles.openfreemap.org/styles/dark` (near-black). Others: `bright`, `positron`.
- No key, no registration. Donation-funded, no uptime guarantee. The PMTiles style is also the fallback if OpenFreeMap is down.
- Attribution: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors.

Offline (P0): Protomaps PMTiles
- npm: `pmtiles`, `@protomaps/basemaps`
- Extract Sydney once with the pmtiles CLI (single binary from protomaps/go-pmtiles GitHub releases; verified 2026-10-17):
```
  pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles sydney.pmtiles --bbox=150.5,-34.3,151.6,-33.4 --maxzoom=13
```
  - Pick `<YYYYMMDD>` from `https://maps.protomaps.com/builds`. Daily builds are kept only for about a week (plus the latest of each patch version), so don't hard-code a date. The planet file is ~139 GB; extract fetches only the needed ranges.
  - Builds are basemap v4, compatible with `@protomaps/basemaps` 4.0.0 and newer (npm latest on 2026-10-17: `@protomaps/basemaps` 5.7.2, `pmtiles` 4.5.0).
- Register the protocol in MapLibre:
```ts
  import { Protocol } from "pmtiles";
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
```
- Build the style with `@protomaps/basemaps` layers and source `pmtiles:///offline/sydney.pmtiles`, served by the web app from `apps/web/public/offline/` (no separate file host).
- Offline also needs glyphs (fonts) and sprites served locally from `/public/offline/`. Download them from `github.com/protomaps/basemaps-assets`: `fonts/` and `sprites/v4/dark` (also `light`, `white`, `grayscale`, `black`). Without this, labels and icons fail offline.
- Attribution: Protomaps, © OpenStreetMap contributors.

### 5.4 Airline prefix mapping (P1)

- Source: OpenFlights `airlines.dat` (ODbL): `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat`
- `scripts/build-airlines.ts` generates `packages/shared/src/airlines.ts`: `{ iata: "QF", icao: "QFA", name: "Qantas" }[]`. Keep only active airlines with both codes.
- Flight number search: `QF1` → `QFA1`. Label results "Matched by airline prefix". Some airlines use callsign numbers that differ from flight numbers, so a miss must say "No live aircraft found for this flight number. The callsign may differ."

### 5.5 Airports (P1, take-off and landing)

- OurAirports CSV: `https://davidmegginson.github.io/ourairports-data/airports.csv` (public domain). Verified 2026-10-17.
- `scripts/build-airports.mts` (`pnpm build:airports`) generates `packages/shared/src/airports.ts`: every AU airport with an ICAO-style ident (`Y` + 3 letters, from `icao_code` or `ident`) within 70 nm of the poll centre. Fields: `ident`, `name`, `lat`, `lon`, `elevationFt`. Commit the generated file.
- Names are OurAirports names, unchanged.

### 5.7 Aircraft photos: Planespotters.net (P1)

- Endpoint: `GET https://api.planespotters.net/pub/photos/hex/{hex}` (photos linked to the current aircraft for that hex). Free, no key, CORS-enabled. Returns at most one photo: `{ photos: [{ id, thumbnail: { src, size }, thumbnail_large: { src, size }, link, photographer }] }`, or an empty array. Verified 2026-10-17.
- Terms (https://www.planespotters.net/photo/api), which shape the design:
  - The **browser** calls the API directly. Our api must not fetch, proxy or re-expose it ("re-exposing the API or its data through your own API" is prohibited). Rule 6 (browsers never call adsb.lol) is unaffected.
  - Images load straight from `thumbnail` / `thumbnail_large` by the browser that shows them. Never stored, re-hosted or proxied, so no Next.js `<Image>` optimisation: use a plain `<img>`.
  - Credit the photographer in visible text next to the image. The thumbnail is a plain link to the `link` URL, unchanged, without `rel="nofollow"`.
  - All returned URLs are used unchanged. JSON may be cached up to 24 h (browser memory is enough).
  - Photos must not be a paid or member-only feature, and must not be used for ML datasets.
- Honesty: label "Photo of {registration} by {photographer}, via Planespotters.net. It may not show the aircraft's current paint scheme." No photo → show nothing (no placeholder aircraft). Not available offline.

### 5.8 OpenSky Network: Australia-wide overview (P1)

- Purpose: show aircraft across Australia at low refresh. adsb.lol only offers circles up to 250 nm, and we're already rate-limited at one request per 10 s.
- Endpoint: `GET https://opensky-network.org/api/states/all?lamin=-44&lomin=112&lamax=-10&lomax=154&extended=1`. Sample: `docs/samples/opensky-states-au.json` (63 aircraft at 11:30 pm Sydney time, 2026-10-17).
- Auth: OAuth2 client credentials only. `POST https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` with `grant_type=client_credentials`, `client_id`, `client_secret`; send `Authorization: Bearer {token}`. Tokens expire after 30 min; refresh early and on 401. Env: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` (server only). Without them the overview is disabled (anonymous is only 400 credits a day).
- Credits (verified 2026-10-17): per-endpoint daily buckets. Anonymous 400, standard user 4,000, active feeder 8,000. `/states/all` costs by bounding-box area: ≤25 sq° 1, 25-100 2, 100-400 3, >400 4. Australia (34° × 42° = 1,428 sq°) costs 4, so a standard account allows one poll every ~86 s. Default `overview.intervalMs` 90,000 (3,840 credits a day). 429 when exhausted, with `X-Rate-Limit-Retry-After-Seconds`.
- Response: `{ time, states: [[icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude (m), on_ground, velocity (m/s), true_track, vertical_rate (m/s), sensors, geo_altitude (m), squawk, spi, position_source, category]] }`. `states` can be null. Units are metric: the adapter converts to ft, kt and fpm. No aircraft type or registration. `category` was 0 ("no information") for 62 of 63 aircraft, so overview aircraft use the generic icon.
- Terms: secondary sources say the data is for non-commercial / research use and ask for citation of OpenSky. The terms page (opensky-network.org/about/terms-of-use) blocks scripted access, so the owner reads it directly. AeroTrack is non-commercial. Attribute "Data: The OpenSky Network" on the map whenever overview aircraft are shown.

### 5.6 LLM phrasing (P2)

- Server only, from `apps/api`. Never the browser.
- Anthropic Messages API: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Suggested model: `claude-haiku-5-5` (fast, cheap) for phrasing.
- Input: the event JSON and template text only. Never raw tracks.
- System prompt must require: keep the three parts, use only provided facts, never state causes, same length or shorter.
- Cache per event id. On failure, keep the template text.

## 6. Shared types (`packages/shared/src/types.ts`)

```ts
export type DataMode = "live" | "recorded" | "fixture";

export interface Observation {
  t: number;            // epoch seconds, position time
  lat: number;
  lon: number;
  altFt: number | null; // null when unknown
  onGround: boolean;
  gsKt: number | null;
  trackDeg: number | null;
  baroRateFpm: number | null;
}

export interface AircraftState {
  hex: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  typeDesc: string | null;
  category: string | null;
  squawk: string | null;
  emergency: string | null;
  last: Observation;
  lastPosTs: number;
  mode: DataMode;
}

export type EventType =
  | "climb" | "descent" | "turn" | "circling"
  | "rapid_descent" | "signal_lost" | "glitch" | "gap" | "emergency"
  | "takeoff" | "landing";

export type Confidence = "observed" | "possible" | "fact";

export interface Explanation {
  seen: string;        // what we see
  commonly?: string;   // what this commonly means (optional for some types)
  cannotTell: string;  // what the data can't confirm
}

export interface Detection {
  type: EventType;
  confidence: Confidence;
  windowStart: number;
  windowEnd: number;
  evidence: Record<string, number | string | boolean>;
}

export interface BehaviourEvent extends Detection {
  id: string;
  hex: string;
  mode: DataMode;
  status: "open" | "closed";
  explanation: Explanation;
  explanationSource: "template" | "llm";
  openedAt: number;
  updatedAt: number;
  closedAt: number | null;
}
```

## 7. Thresholds (`packages/shared/src/config/thresholds.ts`)

All starting values. Tune on recorded data.

```ts
export const THRESHOLDS = {
  poll: { intervalMs: 10000, timeoutMs: 5000, maxBackoffMs: 60000, downAfterFailures: 3, radiusNm: 60, centre: { lat: -33.9, lon: 151.0 } },
  buffer: { keepSec: 900 },
  writer: { flushMs: 5000, maxRows: 500 },
  sse: { heartbeatMs: 15000, maxBufferedBytes: 1000000 },
  overview: { intervalMs: 90000, timeoutMs: 15000, maxBackoffMs: 900000, bbox: { lamin: -44, lomin: 112, lamax: -10, lomax: 154 } },
  follow: { maxFollowed: 10, intervalMs: 30000, afterLandingSec: 900, maxAgeSec: 86400 },
  display: { interpolateMaxSec: 15, sourceUpdateMs: 100, staleAfterSec: 30, altitudeBandsFt: [10000, 25000], levelRateFpm: 100 },
  hygiene: {
    maxImpliedGsKt: 1000,       // drop position jumps faster than this
    minPoints: 4,
    minSpanSec: 60,
  },
  climbDescent: {
    minNetFt: 1000,
    minSpanSec: 60,
    minObs: 4,
    monotonicShare: 0.7,        // share of steps in the same direction
    baroRateFpm: 500,           // alternative trigger: sustained |baro_rate|
  },
  turn: {
    windowSec: 90,
    minCumulativeDeg: 30,
    ignoreStepBelowDeg: 5,
  },
  circling: {
    windowSec: 360,
    minCumulativeDeg: 300,
    sameDirectionShare: 0.8,
  },
  rapidDescent: {
    minRateFpm: 5000,
    minConsecutiveObs: 3,
    minSpanSec: 30,
  },
  glitch: {
    spikeRateFpm: 20000,
    revertWithinSamples: 2,
    revertToleranceFt: 300,
  },
  takeoffLanding: { confirmObs: 3, minClimbFt: 200, maxTouchdownAltFt: 2000, airportRadiusKm: 5, nearAirportKm: 20 },
  gap: { thresholdSec: 60 },
  signalLost: { afterSec: 60 },
  lifecycle: { closeAfterSec: 60, reopenCooldownSec: 120 },
} as const;
```

## 8. Recording file format

Used for live captures, archive imports and test fixtures. Stored in Postgres (`recordings.data`, jsonb) and served by the api (`GET /api/recordings/:id`); offline copies live in `apps/web/public/recordings/` with an `index.json` listing them. No separate file host (decided 2026-10-18: Cloudflare R2 would be over-engineering for this project).

```json
{
  "id": "2026-10-17-ssy-circling-qfa432",
  "title": "Circling before landing, Sydney",
  "mode": "recorded",
  "source": "ADSB.lol live capture",
  "attribution": "Data: ADSB.lol (ODbL)",
  "capturedFrom": 1760684400,
  "capturedTo": 1760685300,
  "bbox": [150.5, -34.3, 151.6, -33.4],
  "reportedCause": null,
  "aircraft": [
    {
      "hex": "7c6b2d",
      "callsign": "QFA432",
      "registration": "VH-VXA",
      "typeCode": "B738",
      "category": "A3",
      "points": [
        [1760684400, -33.71, 151.32, 7000, 230, 182.0, -64, false, "3245"]
      ]
    }
  ]
}
```
- `points` tuple: `[t, lat, lon, altFt|null, gsKt|null, trackDeg|null, baroRateFpm|null, onGround, squawk|null]`. `onGround` is needed for take-off/landing replay; `squawk` for the emergency detector. Barometric altitude only (never GPS), like the live detectors.
- Exported from `positions` (live mode) and `aircraft` identity for a time window, optionally limited to some hexes. `capturedFrom`/`capturedTo` are trimmed to the first and last point inside the requested window, so a replay never opens on an empty map.
- `reportedCause` (optional): `{ "text": "...", "sourceUrl": "...", "sourceName": "..." }`. Shown separately as "Later reported as ... [source]". Never mixed into detector output.
- Fixture files use `"mode": "fixture"` and fake callsigns like `TEST01`.

## 9. Detectors (`packages/detectors`)

All detectors are pure: `(track: Observation[], ctx: DetectContext) => Detection | null`. No I/O, no Date.now() inside. `ctx.now` is passed in, so replays and tests are deterministic.

```ts
export interface DetectContext {
  now: number;               // epoch seconds (replay clock in recorded mode)
  lastPosTs: number;
  squawk: string | null;
  emergency: string | null;
  thresholds: Thresholds;     // THRESHOLDS satisfies this; tests may pass variants
}
export interface RunResult { status: "ok" | "insufficient_history"; detections: Detection[] }
export function runAll(track: Observation[], ctx: DetectContext): RunResult;
```
- `runAll` always reports facts (glitch, gap, signal lost). Behaviour detectors run only when `status` is `ok`, on the latest segment.
- Glitch and gap each report the most recent occurrence in the track (one detection per type, matching the `(hex, type)` lifecycle key). Glitch evidence adds `count`.

### 9.1 Preprocessing (runs first, always)
1. Sort by `t`. Drop exact duplicate `t` (keep last).
2. Drop points with missing lat/lon.
3. `alt_baro === "ground"` → `altFt = 0`, `onGround = true`. Done in the provider adapter, so detectors receive it already applied.
4. Drop position jumps where implied ground speed from the last kept point exceeds `maxImpliedGsKt`.
5. Glitch pass (see 9.7): mark and exclude spike points, emit `glitch` detection.
6. Gap pass (see 9.8): split into segments where `dt > gap.thresholdSec`. Behaviour detectors use ONLY the latest segment.
7. If the latest segment has fewer than `minPoints` or spans less than `minSpanSec`, return status `insufficient_history` and run no behaviour detectors.

Heading maths: always use the signed shortest difference.
```ts
export const dHeading = (a: number, b: number) => ((b - a + 540) % 360) - 180; // -180..180
```

### 9.2 Sustained climb / descent (P0)
- Window: latest segment, at least `minSpanSec` and `minObs` points.
- Trigger A: `|alt_last - alt_first| >= minNetFt` AND at least `monotonicShare` of steps move in that direction.
- Trigger B: the last `minObs` points all have `|baroRateFpm| > baroRateFpm` with the same sign, spanning `minSpanSec`.
- Ignore on-ground points.
- Trigger A uses the longest recent window that qualifies, trimmed to start at the first step in the detected direction. Points with unknown altitude are skipped.
- Evidence: `basis` (`altitude` or `vertical_rate`), `startAltFt`, `endAltFt`, `netFt` (signed), `spanSec`, `avgRateFpm`, `obs`. Altitude fields are omitted when altitude is unknown.
- Confidence: `observed`.

### 9.3 Sustained turn (P0)
- Window: last `turn.windowSec`.
- Ignore on-ground points and points with unknown track.
- Sum signed `dHeading` between consecutive tracks, skipping steps with `|d| < ignoreStepBelowDeg`.
- Trigger: `|sum| >= minCumulativeDeg`.
- Evidence: `totalDeg`, `direction` (`left` if negative, `right` if positive), `spanSec`.
- Confidence: `observed`.

### 9.4 Possible circling (P1)
- Window: last `circling.windowSec`.
- Sum signed `dHeading` (all steps).
- Trigger: `|sum| >= minCumulativeDeg` AND at least `sameDirectionShare` of steps share the sign.
- Evidence: `totalDeg`, `laps` (floor of |sum| / 360), `spanSec`, `altSpreadFt`, `direction`.
- Confidence: `possible`.
- When circling is open, suppress separate `turn` events for the same window.

### 9.5 Rapid descent (P1)
- Trigger: at least `minConsecutiveObs` consecutive points with `baroRateFpm <= -minRateFpm` (or derived rate if baro_rate missing), spanning `minSpanSec`.
- Must not overlap a glitch-marked point.
- Evidence: `peakRateFpm`, `avgRateFpm`, `spanSec`, `startAltFt`, `endAltFt`.
- Confidence: `observed`.

### 9.6 Signal lost / stale (P0)
- Trigger: `ctx.now - ctx.lastPosTs > signalLost.afterSec`.
- Evidence: `secondsSinceLastPosition`, `lastAltFt`, `lastLat`, `lastLon`, plus `lastVertical` (`climbing` / `descending` / `level`, from `display.levelRateFpm`) and, when within `takeoffLanding.nearAirportKm`, `nearAirport`, `nearAirportKm`.
- "How we know" then reads e.g. "Last seen about 8 km from Sydney Kingsford Smith International Airport, descending." It never says the aircraft landed.
- Confidence: `fact`.
- Closes automatically when a fresh position arrives.
- While the signal is lost, behaviour detectors (climb/descent, turn, circling, rapid descent) don't run: the frozen track describes the past, not what the aircraft is doing now. Their events close after `lifecycle.closeAfterSec`. Facts (glitch, gap, take-off/landing, emergency) still report.

### 9.7 Data glitch (P0)
- For each point i: implied rate from i-1 to i exceeds `spikeRateFpm`, and within `revertWithinSamples` the altitude returns within `revertToleranceFt` of point i-1.
- Mark point i as glitch, exclude it from other detectors, emit one `glitch` detection.
- Evidence: `glitchAltFt`, `expectedAltFt`, `impliedRateFpm`, `at`.
- Confidence: `fact`.

### 9.8 Gap in track (P0)
- Any consecutive pair with `dt > gap.thresholdSec`.
- Evidence: `gapStart`, `gapEnd`, `gapSec`.
- Confidence: `fact`.
- The map must NOT draw a line across a gap (MultiLineString, one line per segment).

### 9.9 Emergency code (P1)
- Trigger: `squawk === "7700"` OR `emergency` present and not `"none"`.
- Evidence: `squawk`, `emergency`.
- Confidence: `fact`.
- Never interpreted. Never sent to the LLM.

### 9.11 Take-off and landing (P1)
- Look at every segment of the clean track (a transition must not straddle a gap).
- Take-off: at least `confirmObs` points with `onGround`, followed by at least `takeoffLanding.confirmObs` airborne points, with no ground point among them, gaining at least `minClimbFt` from the first airborne point. Time = first airborne point.
- Landing: at least `confirmObs` airborne points, the last at or below `maxTouchdownAltFt`, followed by at least `confirmObs` ground points with no airborne point among them. Time = first ground point. (Both sides are confirmed, so a single flickering report is never a take-off or landing.)
- Report the most recent take-off and the most recent landing in the buffer (so a card stays for up to 15 minutes, then closes).
- Airport: nearest from `airports.ts` within `airportRadiusKm` of the transition point; otherwise none ("away from the airports we know about").
- Evidence: `at`, `airport` (ident), `airportName`, `airportKm`, plus `altFt` for take-off (altitude at confirmation).
- Confidence: `observed`. Aircraft that never report ground status (some older transponders) produce no take-off or landing events; that's a known limitation, not a reason to guess.

### 9.10 Event lifecycle (`packages/detectors/src/lifecycle.ts`, used by `apps/api/src/eventEngine.ts` and the replay engine)
- Key: `(hex, type)`. At most one open event per key.
- Detection present and no open event, and cooldown passed → open event.
- Detection present and open event → update evidence and `windowEnd`.
- No detection for `closeAfterSec` → close event.
- Do not reopen the same key within `reopenCooldownSec`.
- Never emit an event per poll. Updates are emitted only when evidence, window or confidence changed; the window only widens.
- `signal_lost` closes as soon as it is no longer detected (a fresh position arrived), not after `closeAfterSec`.
- When an aircraft leaves the buffer, all its open events close.

## 10. Explanation templates (`packages/detectors/src/explain.ts`)

Each returns `{ seen, commonly?, cannotTell }`. Fill only from evidence; a missing value renders "Not available". Round numbers for humans (altitudes to nearest 100 ft, rates to nearest 100 fpm, times to nearest 10 s under a minute, otherwise nearest minute). Exception: "staying within {altSpreadFt} ft" is an upper bound, so it rounds up to the next 100 ft. Clock times use `DISPLAY_TIME_ZONE` (Australia/Sydney) from `packages/shared/src/config/display.ts`, formatted like "12:20 pm".

| Type | seen | commonly | cannotTell |
|---|---|---|---|
| climb | "This aircraft has climbed {netFt} ft in the last {span}." | "Aircraft climb after take-off and when moving to a new cruising level." | "The data doesn't show why it is climbing." |
| descent | "This aircraft has descended {netFt} ft in the last {span}." | "This often happens on approach to land." | "The data doesn't confirm why or where it will land." |
| turn | "This aircraft has turned {totalDeg}° to the {direction} in the last {span}." | "Turns are often part of a planned route or an adjustment in flight." | "The data doesn't show the reason for the turn." |
| circling | "This aircraft has turned through {totalDeg}° in {span}, staying within {altSpreadFt} ft of the same altitude." | "Aircraft sometimes fly circular patterns while waiting." | "The data alone can't confirm that it is waiting, or why." |
| rapid_descent | "This aircraft is descending unusually quickly, about {peakRateFpm} ft per minute." | (none) | "This can happen for several reasons, and the data doesn't show which." |
| signal_lost | "No new position for {secondsSinceLastPosition}." | "This is usually a gap in receiver coverage, which is common over the ocean." | "It doesn't mean anything happened to the aircraft." |
| glitch | "One altitude reading was inconsistent and has been ignored." | "Single bad readings are a normal part of radio data." | "It doesn't reflect a real change in altitude." |
| gap | "No data between {gapStart} and {gapEnd}." | (none) | "The line shows a gap, not the actual path." |
| emergency | "This aircraft is transmitting an emergency code." | (none) | "The code alone doesn't tell us the reason." |
| takeoff | "This aircraft took off near {airportName} at {time}." / "This aircraft took off at {time}, away from the airports we know about." | (none) | "The data doesn't show where it is going." |
| landing | "This aircraft landed near {airportName} at {time}." / "This aircraft landed at {time}, away from the airports we know about." | (none) | "The data doesn't show the flight's full route." |

Card labels: "What we see", "What this commonly means", "What we can't tell". Plus a "How we know" expander listing evidence in plain words.

## 11. Backend (`apps/api`)

### 11.1 Poller
- `setInterval` with drift guard; never overlap requests (skip tick if previous in flight).
- Timeout 5 s via AbortController.
- `feedStatus` starts as `degraded` until the first successful poll, then `ok`.
- The next poll is scheduled when the current one finishes (interval minus the time it took), so polls never overlap. The provider's `now` drives detection, not the server clock.
- On failure (network error, timeout, non-2xx, 429, or a body that isn't JSON): exponential backoff (`interval × 2^failures`) up to 60 s. One or two failures in a row set `feedStatus = "degraded"` (data getting older); `poll.downAfterFailures` (3) in a row set `"down"`. Broadcast status on change. Keep last known states. A 429 is an HTML page with no `Retry-After`, so never parse it as data.
- Exactly one poller per process, including in dev (guard against hot-reload starting a second one).
- The adapter drops category C1-C7 (ground vehicles and obstacles) and type `TWR` (towers), and aircraft without `lat`/`lon`/`seen_pos` (position time unknown). Missing `emergency` maps to null, not `none`.
- Manual check: `ADSB_USER_AGENT=... pnpm --filter api fetch:sample` makes one real request through client, schema and adapter and logs the result.
- On success: parse with Zod (passthrough unknown fields, never crash on extra fields), adapt to `AircraftState`, push observations into the buffer.

### 11.2 Ring buffer
- `Map<hex, Observation[]>`, trim to `buffer.keepSec`.
- Ignore observations whose `t` is not newer than the last stored `t` for that hex.
- On startup, hydrate the last 15 min from Postgres so detectors have history immediately. Open events are continued (`EventLifecycle.restore`); open events for aircraft no longer in the window are closed. `emergency` is not stored, so it is null until the next poll.

### 11.3 Event engine
- After each poll, for every hex in the buffer (including ones missing from this poll, for signal loss): `runAll(track, ctx)`, then apply lifecycle, then build explanation, then persist and broadcast changes.
- Drop aircraft from the buffer 15 min after last position.

### 11.4 Writer
- Batch insert positions every 5 s or 500 rows, whichever first. Aircraft and event upserts ride the same flush (latest version per key).
- Events upserted on change.
- On a failed write the batch is re-queued (writes are idempotent). Queued positions are capped at 20 × maxRows; the oldest are dropped with a warning.

### 11.5 Retention job
- Every 30 min: delete live positions older than 24 h. Never delete positions referenced by a saved recording window (recordings are exported to JSON anyway).

### 11.6 Database schema (Drizzle, Postgres)

```ts
aircraft: hex (pk text), callsign, registration, type_code, type_desc, category, last_seen_at (timestamptz)
positions: id (bigserial pk), hex, t (timestamptz), lat, lon, alt_ft (int null), on_ground (bool),
           gs_kt (real null), track_deg (real null), baro_rate_fpm (int null), squawk (text null), mode (text)
           unique index (hex, t) (re-inserting a position is a no-op), index (t)
events: id (uuid pk), hex, type, confidence, status, mode, window_start, window_end,
        evidence (jsonb), explanation (jsonb), explanation_source, opened_at, updated_at, closed_at
        index (hex, opened_at), index (status)
recordings: id (text pk), title, source, attribution, captured_from, captured_to, aircraft_count (int), data (jsonb: the recording JSON, section 8), reported_cause (jsonb null), created_at
follows: hex (text pk), added_at, landed_at (null)    -- the shared follow list, saved on every change (11.11)
sightings: id (uuid pk), hex, started_at, last_seen_at, took_off_at (null), takeoff_airport (null), landed_at (null), landing_airport (null)
           index (hex, started_at)
```

### 11.9 Sightings ("Seen by AeroTrack")
- A sighting is one continuous stretch of an aircraft in our data: a new observation more than `buffer.keepSec` after the sighting's last one starts a new sighting. Tracked by `apps/api/src/sightings.ts`, persisted through the writer, continued after a restart.
- A take-off after a landing within the same sighting starts a new sighting (a new flight we watched).
- Take-off and landing events fill `took_off_at` / `landed_at` and the airport idents.
- Never deleted by retention (small rows). Counts only what our receivers' coverage showed; it is not a lifetime flight count.
- `/api/aircraft/:hex` adds `sightings: { last7Days, total, firstSeenAt }`, including the current sighting even before it reaches the database.

### 11.10 Australia-wide overview (OpenSky)
- Second poller (`apps/api/src/overview/`), same pattern as the main one: one request for everyone, never overlapping, backoff on failure. Interval `overview.intervalMs`.
- Adapter + Zod schema like adsb.lol. Drops states without a position and surface vehicles / obstacles (categories 16-20). Maps categories 2-8 to A1-A7 for display.
- No detectors: updates every ~90 s would create false gap and signal-lost events. Overview aircraft never get insights, take-off/landing events or sightings.
- Not written to Postgres (display only). Held in memory: latest list, `fetchedAt`, status.
- SSE `overview` event: `{ fetchedAt, feedStatus, aircraft: OverviewCompact[] }` on connect and after each overview poll. `OverviewCompact = [hex, callsign, lat, lon, altFt, altGeomFt, gsKt, trackDeg, baroRateFpm, onGround, lastPosTs]` (`packages/shared/src/overview.ts`).
- Web: drawn as a second, lighter layer with the generic icon and no labels below zoom 8. Any hex in the detailed (adsb.lol) set or followed set is drawn from that set instead. Selecting an overview aircraft shows its basic fields, a photo, "Follow this flight", and "Australia-wide data from the OpenSky Network, updated about every 90 seconds. Detailed insights are available near Sydney and for followed flights." No dead reckoning beyond `display.interpolateMaxSec`, so overview aircraft move in steps; the label explains why.
- `/health` adds `overview: { enabled, feedStatus, fetchedAt, aircraftCount }`.

### 11.11 Follow a flight (worldwide)
- `POST /api/follows/:hex` adds an aircraft, `DELETE /api/follows/:hex` removes it, `GET /api/follows` lists them. The list is shared by all viewers (one poll for everyone) and capped at `follow.maxFollowed` (10); a full list says "Following is full right now (10 flights). Try again later."
- One adsb.lol request per `follow.intervalMs` (30 s) for all followed hexes (`/v2/hex/{a},{b},...`), through the same adapter (C* and TWR filters apply).
- Followed aircraft get the full pipeline outside the Sydney circle: buffer, detectors, events, sightings, positions in Postgres. Inside the circle the main poll already covers them.
- Take-off/landing worldwide uses a global airport list (OurAirports large and medium airports with an IATA code) kept on the server and passed to detectors through `DetectContext.airports`; detectors default to the Sydney list (the browser bundle stays small).
- A follow ends automatically `follow.afterLandingSec` (15 min) after an observed landing, or after `follow.maxAgeSec` (24 h).
- The list is saved to Postgres (`follows`) on every change and reloaded at startup, so a restart or deploy never drops a flight mid-ocean. SSE `follows` message `{ max, follows }` on connect and on change.
- Followed aircraft are never dropped from the buffer (`AircraftStore.prune` keep set); they keep their last position however long the gap.
- Web: "Follow this flight" / "Following · Stop following" in the details panel (also for overview aircraft); a "Following" row of chips under the badges selects a flight and flies the map to it; followed aircraft are labelled at every zoom.
- Worldwide airports: `pnpm build:airports --world` writes `apps/api/src/data/worldAirports.ts` (4,568 large and medium airports with an IATA code), merged with the Sydney list on the server.
- Honesty: no destination until a landing is observed ("Landed near {airport} at {time}"). Over the ocean there is usually no receiver coverage, so the aircraft can vanish for hours; the panel says "There's usually no receiver coverage over the ocean. The last known position is shown." The map never draws a path through missing data.

### 11.7 HTTP API

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ ok, feedStatus, lastPollAt, aircraftCount }` |
| GET | `/api/aircraft` | Current snapshot: `AircraftState[]` |
| GET | `/api/aircraft/:hex` | `{ state, history: "ok" \| "insufficient_history", openEvents, recentEvents }` |
| GET | `/api/aircraft/:hex/track?minutes=15` | `{ segments: Observation[][] }` from the in-memory buffer (minutes 1-15), cleaned and split at gaps by `preprocess` |
| GET | `/api/events?hex=&status=&since=` | `BehaviourEvent[]` |
| GET | `/api/search?q=` | Matches by callsign, registration, type, or flight number via prefix. Each with `freshness`: `live`, `last_seen_<n>m`, `not_seen` |
| GET | `/api/recordings` | List of recordings metadata (no points) |
| GET | `/api/recordings/:id` | The full recording JSON (section 8) |
| POST | `/api/recordings` | Admin only (header `x-admin-token`, compared in constant time; disabled when `ADMIN_TOKEN` is unset). Body `{ title, from, to, hexes? }` (epoch seconds). Exports the window from Postgres and stores it |
| GET | `/api/stream` | SSE |

### 11.8 SSE contract (`/api/stream`)

Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Heartbeat comment every 15 s. CORS limited to `CORS_ORIGIN`.

Events:
```
event: snapshot      data: { now, mode: "live", feedStatus, aircraft: CompactAircraft[] }   // on connect and every poll
event: event_open    data: BehaviourEvent
event: event_update  data: BehaviourEvent
event: event_close   data: { id, hex, closedAt }
event: status        data: { feedStatus: "ok" | "degraded" | "down", lastPollAt }   // on connect and when it changes
```
`CompactAircraft` = `[hex, callsign, lat, lon, altFt, gsKt, trackDeg, baroRateFpm, typeCode, category, lastPosTs, hasOpenEvent, onGround]` to keep payloads small. `onGround` is needed because `altFt` 0 alone can't tell a taxiing aircraft from one at 0 ft. Encode/decode with `toCompact` / `fromCompact` in `packages/shared/src/compact.ts`.
- On each poll, event messages are sent before the snapshot. `lastPollAt` is epoch ms.
- Clients more than `sse.maxBufferedBytes` behind are disconnected. Open streams are closed on shutdown.

## 12. Frontend (`apps/web`)

### 12.1 Modes
- Zustand store holds `mode: "live" | "recorded"`.
- Live: connect SSE, render server state and server events.
- Recorded: disconnect SSE, load recording JSON, run the replay engine. No live record ever appears.
- Switching mode clears the map and store.

### 12.2 Mode badge (always visible)
- Live: "Live · updated {n}s ago" (time since the last snapshot arrived, browser clock). Turns amber if stale over 30 s, or while the feed is `degraded` (a missed poll is shown as ageing data, not an outage).
- Can't reach our API: "Can't reach AeroTrack right now · showing last known positions".
- Server started but no poll yet: "Live · waiting for the first update".
- Live feed down: "Live feed unavailable · showing last known positions" plus a button "Watch a recorded flight".
- Recorded: "Recorded flight · {date, time} · {speed}x · Data: ADSB.lol (ODbL)".
- Fixture (only if ever demoed): "Synthetic test case · not a real aircraft".

### 12.3 Map
- One GeoJSON source for all aircraft, one symbol layer. No HTML markers.
- `icon-rotate` bound to `trackDeg`, `icon-rotation-alignment: map`.
- Icon class from category/type (narrowbody, widebody, turboprop, light, helicopter, unknown). Original SVGs only. Type designator first (`apps/web/lib/iconClass.ts`), then emitter category; A2 alone stays `unknown` (regional jet or turboprop). When `trackDeg` is unknown, draw a non-directional dot: a plane icon would claim a heading.
- Colour by altitude band.
- Small badge on aircraft with an open event.
- Selected aircraft: track layer from `/api/aircraft/:hex/track`, drawn as MultiLineString so gaps show as gaps.
- Interpolation: between updates, dead-reckon from last fix using `gsKt` and `trackDeg`, capped at 15 s, snap on new data. `requestAnimationFrame`, update source at most 10 times per second. Position age = (snapshot `now` − `lastPosTs`) + browser time since the snapshot arrived, so server/browser clock skew doesn't matter. No dead reckoning on the ground. Aircraft dim after `display.staleAfterSec`.
- MapLibre 6 loads its worker relative to its own module URL, which breaks when bundled. `apps/web/scripts/copy-maplibre-worker.mjs` copies it to `public/` before dev/build and `setWorkerUrl` points at it.
- Attribution control always on.

### 12.4 Details panel
- Identity: callsign, registration, type (code + description). The live API has no `desc`, so live `typeDesc` is null ("Not available") unless a static type-code table is added later. Archive imports may fill it from the trace's top-level `desc`.
- Photo (5.7) at the top when Planespotters has one, with the credit line and link. Otherwise nothing.
- Now: altitude, speed, heading, vertical rate, last position time ("12 s ago").
- Altitude: show GPS altitude (`alt_geom`, carried as `altGeomFt`) when present, labelled "(GPS)". Otherwise barometric altitude labelled "(pressure altitude)" with the note "Measured against standard air pressure, so it can differ from the real height by a few hundred feet." Map colour bands use the same displayed altitude. Detectors always use barometric altitude (never mixed within a track). GPS altitude is height above the WGS84 ellipsoid, about 70 ft above sea level around Sydney.
- "Seen by AeroTrack: {n} times in the last 7 days" (11.9), with "Counts only what our coverage showed since {firstSeenAt}."

- Insights: all open event cards, newest first, then timeline (P1). Titles in `apps/web/lib/eventCopy.ts`; "possible" events get an amber "Possible" chip.
- On selection the panel loads `/api/aircraft/:hex` and the track, and refreshes both after every snapshot. Open events from the detail response seed the store, because the stream only sends changes made after the browser connected.
- With enough history and no open events: "No notable changes in the last few minutes."
- "How we know" uses `describeEvidence` from `packages/detectors/src/evidence.ts` (facts only; lines with missing evidence are left out).
- Selection: click an aircraft (ring highlight), click empty map or press Escape to clear. If the panel would cover the tapped aircraft, the map eases it into view. The panel never covers the map attribution.
- Any missing field: "Not available from this source".
- Insufficient history: "Insights appear after about a minute of observations."

### 12.5 Replay engine (`lib/replay/engine.ts`)
- Input: recording JSON, speed (1x, 10x, 20x), start offset.
- Replay clock drives `ctx.now`.
- Each tick: emit points with `t <= clock`, update per-hex tracks, run `runAll` from `packages/detectors`, apply the same lifecycle rules (`EventLifecycle`, mode `recorded`), render.
- Detectors are evaluated every `poll.intervalMs` of replay time (like the live server), not every frame, so results match what live would have shown.
- Scrubbing backwards replays from the start up to the new time (recordings are short, so this is instant).
- The replay writes into the same store shapes as live (aircraft, events) with `mode: "recorded"`; the map and panel are reused. The panel's details and track come from the recording, never the api.
- Controls: play, pause, speed, scrub.
- Must work with no network.
- Routes: `/recorded` lists recordings (api when online, `public/recordings/index.json` when offline or the api is unreachable); `/recorded/[id]` plays one.

### 12.6 Search and filters (P1)
- Search input accepts callsign, registration, type, or flight number.
- Flight number → callsign via `airlines.ts` prefix map, labelled "Matched by airline prefix".
- `not_seen` result text: "We can't see this aircraft right now. That doesn't mean the flight isn't operating."
- Filters: airline (from callsign prefix), aircraft type class. Clear-all button. Not persisted.

### 12.7 Design
- Dark aviation palette: navy `#101B2E`, sky `#51B9FF`, teal `#23C9A9`, amber `#F5B85B`, text `#E9F1F9`.
- Amber reserved for `possible` events, stale data and warnings.
- Desktop: map plus right side panel. Mobile: map plus simple bottom panel.
- WCAG AA contrast.

## 13. Offline demo mode

- Env flag `NEXT_PUBLIC_OFFLINE=1` switches the map style to local PMTiles, local fonts and sprites, and disables SSE. The home page becomes the list of recorded flights ("Offline demo mode · live data needs an internet connection"); photo lookups are skipped; recordings load from `public/recordings`.
- Assets: `pnpm --filter web offline:assets` (needs the pmtiles CLI on PATH or `PMTILES_BIN`) writes `apps/web/public/offline/` (gitignored, ~41 MB): `sydney.pmtiles` (newest Protomaps daily build, bbox `149.7,-35.0,152.3,-32.8` = the 60 nm live circle plus a margin, maxzoom 13, ~27 MB), `fonts/` (Noto Sans Regular, Medium, Italic, Devanagari) and `sprites/v4/dark*` from `protomaps/basemaps-assets` pinned to commit `028c18f7`.
- Style: `apps/web/lib/mapStyle.ts` (`@protomaps/basemaps` dark flavor, English labels), tiles through the `pmtiles://` protocol. Outside the extract box the map shows only the background colour (e.g. a followed flight over Queensland in a recording).
- Verified 2026-10-18: offline production build replaying a recording made 37 requests, all to the local server.
- Run locally on the demo laptop: `pnpm --filter web build && pnpm --filter web start`.
- Recordings in `public/recordings` (`index.json` plus one `{id}.json` per recording), copied there with `pnpm --filter api recording:export -- --out ../web/public/recordings ...`.
- Test with wifi physically off before the demo.

## 14. Build phases for Claude Code

Do these in order. Each ends with its done-criteria passing.

1. **Scaffold.** pnpm workspace, tsconfig base, apps and packages, lint, Vitest. Done: `pnpm typecheck && pnpm test` pass on empty packages.
2. **Shared + detectors core.** Types, thresholds, `dHeading`, preprocessing, gap, glitch, climb/descent, turn, signal lost, explain templates. Fixtures and tests (see 15). Done: all tests green.
3. **Provider adapter.** adsb.lol client with User-Agent, Zod schema, adapter, one real fetch logged. Done: adapter test passes on a saved real response.
4. **API core.** Fastify, env validation, Drizzle schema and migration, poller, buffer, writer, event engine, `/health`, `/api/aircraft`, `/api/aircraft/:hex`, `/api/aircraft/:hex/track`. Done: positions accumulate; restart hydrates buffer.
5. **SSE.** `/api/stream` with snapshot, event and status messages. Done: curl shows live snapshots.
6. **Web map.** Live map, aircraft layer, interpolation, mode badge, attribution. Done: planes move smoothly over Sydney from local api.
7. **Details panel + event cards.** Done: selecting an aircraft shows fields and live events with three-part cards and evidence.
8. **Recordings.** `scripts/export-recording.ts`, `/api/recordings` (stored in Postgres), replay engine in web, recorded route. Done: a recorded track replays and fires detectors in the browser.
9. **Offline.** PMTiles extract, local fonts/sprites, offline flag. Done: full replay works with wifi off.
10. **P1 detectors.** Circling, rapid descent, emergency, timeline. Done: tests plus visible on a recording.
11. **Search and filters.** Done: callsign and flight-number search with honest not-seen states.
12. **Archive incident.** `scripts/import-globe-history.ts` for one incident, with `reportedCause` and source. Done: replays with "Later reported as" panel.
13. **Deploy.** Vercel, Railway. Done: public URL works signed-out on a phone.
14. **P2** only after all of the above.

## 15. Test plan (`packages/detectors/test`)

Required fixtures and expectations:
- Steady level cruise → no events.
- Clean climb 3,000 ft over 3 min → `climb`.
- Small altitude wobble ±200 ft → no climb/descent.
- Heading 350° → 10° → 30° → `turn`, total 40°, not 320°.
- Duplicates and out-of-order timestamps → same result as clean input.
- Single altitude spike of +8,000 ft that reverts next sample → `glitch`, no climb, no rapid descent.
- 3-minute gap mid-track → `gap`; detectors use only the latest segment.
- Only 2 points → insufficient history, no behaviour events.
- 400° cumulative turn at steady altitude in 5 min → `circling` with laps 1, no separate `turn`.
- Sustained -6,000 fpm for 40 s → `rapid_descent`.
- `now - lastPosTs = 180` → `signal_lost` with 3 min.
- Squawk 7700 → `emergency`.
- Lifecycle: same climb across 10 polls → one event opened, updated, closed once.

## 16. Open questions

- Final product name: AeroTrack or FlightSense.
- Accounts and watchlist: currently cut. Adding Better Auth or Auth.js with a watchlist table is roughly a half-day if needed.
- Poll interval: adsb.lol publishes no limit (dynamic, load-based). 7 s drew regular 429s; now 10 s. Revisit if 429s continue.
- Whether to show "typical route" from the adsb.lol routeset API.
- Aircraft details (year built, operator): on hold. Would need an open aircraft database with a compatible licence (the live API doesn't include them; archive traces have `ownOp`, `year`).
- A source for lifetime flight history per aircraft (the owner is researching). Until then, only our own sightings (11.9).

## 17. Environment variables

`apps/api`:
```
DATABASE_URL=postgres://...
PORT=8080
ADSB_BASE_URL=https://api.adsb.lol
ADSB_USER_AGENT=AeroTrack/0.1 (+you@example.com)
ADSB_API_KEY=                 # optional, not required as of 2026-10-17
POLL_INTERVAL_MS=10000
CORS_ORIGIN=https://aerotrack.vercel.app
ADMIN_TOKEN=change-me
OPENSKY_CLIENT_ID=            # Australia-wide overview (5.8); overview disabled if unset
OPENSKY_CLIENT_SECRET=
ANTHROPIC_API_KEY=            # P2 only
```

`apps/web`:
```
NEXT_PUBLIC_API_URL=https://<railway-domain>
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
NEXT_PUBLIC_OFFLINE=0
```

## 18. Deployment

**Vercel (web)**
- Import repo, root directory `apps/web`, framework Next.js.
- Install command `pnpm install`, build `pnpm --filter web build` (or let Vercel detect the workspace).
- Set web env vars.

**Railway (api + Postgres)**
- New service from repo, root `apps/api`, start `pnpm --filter api start`.
- Add the Postgres plugin; `DATABASE_URL` is injected.
- Run migrations on deploy (`pnpm --filter api db:migrate` as a pre-start step).
- Watch paths: `apps/api/**`, `packages/**`.
- Single instance (the poller must not run twice).


## 19. Attribution and compliance

- Map footer: "Data: ADSB.lol (ODbL) · © OpenStreetMap contributors · OpenFreeMap / Protomaps", plus "Data: The OpenSky Network" whenever overview aircraft are shown.
- Recordings carry their own attribution string.
- README lists every library, data source and API, plus known limitations.
- No Flightradar24 data, exports, assets or interface copying.
- One shared backend poll to respect provider limits.

## 20. Known limitations (keep updated in README)

- Coverage depends on community receivers. Gaps over the ocean are normal.
- adsb.lol fields vary by aircraft; many are optional.
- Flight number to callsign by prefix is not reliable for every airline.
- Explanations describe patterns, not causes.
- Not for safety-critical use.