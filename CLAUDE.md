# AeroTrack

Flight tracker that explains what an aircraft is observably doing, in plain English, and never claims more than the data shows. Informational only. Not a safety, navigation or emergency-detection system.

Full spec: `docs/SPEC.md`. Read the relevant section before starting any task.

## Stack
- pnpm workspaces monorepo, TypeScript strict everywhere
- `apps/web`: Next.js (App Router), Tailwind, shadcn/ui, MapLibre GL JS via react-map-gl/maplibre, Zustand. Deploys to Vercel.
- `apps/api`: Node + Fastify, Drizzle ORM, Postgres. Deploys to Railway.
- `packages/detectors`: pure TS behaviour rules + Vitest tests. Used by BOTH api and web.
- `packages/shared`: types, Zod schemas, thresholds config.
- Cloudflare R2: recordings JSON and sydney.pmtiles only.

## Commands
- `pnpm install`
- `pnpm dev` (all apps) / `pnpm --filter web dev` / `pnpm --filter api dev`
- `pnpm test` (Vitest, all packages)
- `pnpm --filter detectors test --watch`
- `pnpm --filter api db:generate` / `db:migrate` (Drizzle)
- `pnpm typecheck` / `pnpm lint`

## Non-negotiable rules
1. Detection is deterministic code in `packages/detectors`. No LLM decides whether an event happened.
2. Never invent positions, identities, routes or statuses. Missing data renders as "Not available".
3. Every aircraft record and event carries its data mode: `live`, `recorded` or `fixture`. Modes are never mixed in one view.
4. All thresholds live in `packages/shared/src/config/thresholds.ts`. No magic numbers in detectors.
5. Provider responses pass through an adapter + Zod schema. UI and detectors never read raw adsb.lol fields.
6. One backend poller serves all clients. Browsers never call adsb.lol directly.
7. Secrets only on the server. Nothing sensitive behind `NEXT_PUBLIC_`.
8. Explanations never state a cause. Use "commonly", "possibly", "the data doesn't show why".
9. Attribute ADSB.lol (ODbL) and OpenStreetMap/OpenFreeMap/Protomaps on the map.
10. No Flightradar24 data, assets, names or interface copying.

## Workflow
- Build in the phase order in `docs/SPEC.md` section 14. Finish a phase's done-criteria before the next.
- Write detector tests before wiring detectors into the app.
- Run `pnpm typecheck && pnpm test` before every commit.
- Conventional commits, one commit per completed step.
- If an external API behaves differently from the spec, stop, report the actual response, and update the spec.

## UI copy style
Plain English. Short sentences. No aviation jargon without a plain explanation. Calm tone. Never alarming.