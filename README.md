# AeroTrack

A flight tracker for Sydney that explains what an aircraft is observably doing, in plain English, and never claims more than the data shows.

**Informational only.** AeroTrack is not a safety, navigation or emergency-detection system. Explanations describe patterns in the data, never causes.

## What it does

- **Live map** of aircraft around Sydney (detailed, every 10 seconds), plus every aircraft over Australia (lighter detail, every 90 seconds).
- **Insights** written by deterministic rules, never an AI: climbing, descending, turning, possibly circling, rapid descent, emergency code, take-off, landing, signal lost, gaps and data glitches. Each one says what we see, what it commonly means and what the data can't tell us, with a "How we know" list.
- **Follow a flight** after it leaves the Sydney area, worldwide, until it lands.
- **Search** by flight number (QF1), callsign (QFA1), registration (VH-OQA) or aircraft type (B738), and **filter** by airline or aircraft type.
- **Recorded flights** replayed in the browser through the same rules as live, including one archived real incident with a separate, sourced "Later reported as" note.
- **Offline demo mode** with a local map, for presenting without internet.

Every view shows its data mode (live, recorded or synthetic test case), and modes never mix.

## Project layout

pnpm workspaces monorepo, TypeScript strict throughout.

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js app (map, panel, replay). Deploys to Vercel. |
| `apps/api` | Fastify server: one shared poller per provider, event engine, Postgres, SSE stream. Deploys to Railway. |
| `packages/detectors` | Pure TypeScript behaviour rules and their tests. Used by both the api and the browser replay. |
| `packages/shared` | Types, Zod schemas, thresholds, airports and airline codes. |
| `docs/SPEC.md` | The full specification, including every decision and verified API behaviour. |

## Running locally

Needs Node 22.12+, pnpm 10 (via corepack) and Docker.

```sh
pnpm install
docker compose up -d                       # Postgres on port 5433 (also creates aerotrack_test)
cp apps/api/.env.example apps/api/.env     # then set ADSB_USER_AGENT (and OpenSky keys if you have them)
cp apps/web/.env.example apps/web/.env.local
pnpm --filter api db:migrate
pnpm dev                                   # web on :3000, api on :8080
```

Checks: `pnpm typecheck`, `pnpm test`, `pnpm lint`.

Useful scripts:

- `pnpm --filter api recording:export -- --title "..." --from <time> --to <time> [--out ../web/public/recordings]`: save a live capture as a recording (positions are kept for 24 hours).
- `pnpm --filter api recording:import -- --trace <file> --title "..." --from <time> --to <time> --cause <cause.json>`: import an ADSB.lol archive trace (see SPEC 5.2).
- `pnpm --filter web fixture:recording`: regenerate the synthetic test recording.
- `pnpm build:airports [--world]`, `pnpm build:airlines`: regenerate the airport and airline lists.
- Offline demo: `pnpm --filter web offline:assets`, then `NEXT_PUBLIC_OFFLINE=1 pnpm --filter web build && pnpm --filter web start`.

## Deployment

- **API on Railway**: one service from this repo with the root directory left at the repo root and the config file `railway.json` at the repo root (start command, migrations before each deploy, health check, a single replica). Add the Postgres plugin for `DATABASE_URL`, and set `ADSB_USER_AGENT`, `CORS_ORIGIN` (the Vercel URL), `ADMIN_TOKEN` and optionally the OpenSky keys. Keep exactly one replica: the poller must not run twice.
- **Web on Vercel**: import the repo with root directory `apps/web` and set `NEXT_PUBLIC_API_URL` to the Railway URL. Nothing secret goes in `NEXT_PUBLIC_` variables.

Environment variables are listed in `apps/api/.env.example`, `apps/web/.env.example` and SPEC section 17.

## Data sources and credits

| Source | Used for | Licence / terms |
| --- | --- | --- |
| [ADSB.lol](https://adsb.lol) live API | Detailed aircraft positions around Sydney, followed flights | ODbL. Credited on the map. |
| [ADSB.lol globe_history](https://github.com/adsblol) archive | The archived incident recording | ODbL |
| [The OpenSky Network](https://opensky-network.org) | Australia-wide overview | Non-commercial use. Credited on the map whenever these aircraft are shown. |
| [OpenFreeMap](https://openfreemap.org) | Online map tiles and style | Free, credit required |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | Map data | ODbL |
| [OpenMapTiles](https://openmaptiles.org) | Tile schema | Credited with the tiles |
| [Protomaps](https://protomaps.com) | Offline map tiles (PMTiles) and basemap style | BSD / ODbL data |
| [Planespotters.net](https://www.planespotters.net) | Aircraft photos, loaded by the browser from their servers | Photographer credit and link required; no proxying or re-hosting |
| [OurAirports](https://ourairports.com/data/) | Airport names and positions | Public domain |
| [OpenFlights](https://openflights.org/data) | Airline codes for flight-number search | ODbL. Last updated 2017, so it is incomplete. |
| [ATSB](https://www.atsb.gov.au/investigations/ao-2024-057) final report AO-2024-057 | The "Later reported as" note on the archived incident | Quoted and linked |

No Flightradar24 data, assets, names or interface designs are used.

## Libraries

- Web: [Next.js](https://nextjs.org), [React](https://react.dev), [MapLibre GL JS](https://maplibre.org) via [react-map-gl](https://visgl.github.io/react-map-gl/), [PMTiles](https://github.com/protomaps/PMTiles), [@protomaps/basemaps](https://github.com/protomaps/basemaps), [Zustand](https://zustand.docs.pmnd.rs), [Tailwind CSS](https://tailwindcss.com).
- API: [Fastify](https://fastify.dev) with [@fastify/cors](https://github.com/fastify/fastify-cors), [Drizzle ORM](https://orm.drizzle.team) and drizzle-kit, [postgres.js](https://github.com/porsager/postgres), [tsx](https://tsx.is).
- Shared: [Zod](https://zod.dev).
- Tooling: [TypeScript](https://www.typescriptlang.org), [Vitest](https://vitest.dev), [ESLint](https://eslint.org) with typescript-eslint, [pnpm](https://pnpm.io).

## Known limitations

- Coverage depends on volunteer receivers. Gaps, especially over the ocean, are normal and shown as gaps.
- ADSB.lol publishes no rate limit and sometimes slows down or stops responding. The map then says the live feed is unavailable and keeps the last known positions.
- The OpenSky allowance (4,000 credits a day) allows one Australia-wide update every 90 seconds, and only one running server can use the same account.
- Fields vary by aircraft; many are optional. Missing values show as "Not available".
- Flight number to callsign matching uses airline codes and isn't right for every airline, especially newer ones (the airline list is from 2017).
- Altitudes for insights are pressure altitudes; the panel shows GPS altitude when available.
- Live positions are kept for 24 hours, so a live capture must be saved as a recording within a day.
- Photos may not show the aircraft's current paint scheme.
- Explanations describe patterns, not causes. Not for safety-critical use.
