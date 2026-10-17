import { randomUUID } from "node:crypto";
import { EventLifecycle } from "@aerotrack/detectors";
import { AIRPORTS, THRESHOLDS, type Airport } from "@aerotrack/shared";
import { buildApp } from "./app";
import { AircraftStore } from "./buffer";
import { WORLD_AIRPORTS } from "./data/worldAirports";
import { createDb } from "./db/client";
import { createPgRepo } from "./db/repo";
import { loadDotEnv, loadEnv } from "./env";
import { createEventEngine } from "./eventEngine";
import { FollowList } from "./follows";
import { hydrate } from "./hydrate";
import type { ParsedResponse } from "./providers/adsblol/schema";
import { createPipeline } from "./pipeline";
import { createPoller } from "./poller";
import { ProviderError, createAdsbLolClient } from "./providers/adsblol/client";
import { OverviewStore } from "./overview/overviewStore";
import { adaptStates } from "./providers/opensky/adapter";
import { createOpenSkyClient, createTokenProvider } from "./providers/opensky/client";
import { SightingTracker } from "./sightings";
import { SseHub } from "./sse";
import { changeMessages, followsMessage, overviewMessage, snapshotMessage, statusMessage } from "./streamMessages";
import { createWriter } from "./writer";

loadDotEnv();
const env = loadEnv();

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const repo = createPgRepo(db);
const store = new AircraftStore(THRESHOLDS);
const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: randomUUID });
// Followed flights (SPEC 11.11): shared list, kept in the buffer through long gaps.
const follows = new FollowList(THRESHOLDS.follow, await repo.loadFollows());
// Sydney-region airports (incl. small fields) first, then the worldwide list for followed flights.
const airports: Airport[] = [...new Map([...AIRPORTS, ...WORLD_AIRPORTS].map((a) => [a.ident, a])).values()];
const engine = createEventEngine({
  store,
  lifecycle,
  thresholds: THRESHOLDS,
  airports,
  keepHexes: () => new Set(follows.hexes()),
});
const hub = new SseHub(THRESHOLDS.sse);
// Continue sightings still open before a restart (same window as the buffer).
const sightings = new SightingTracker({
  keepSec: THRESHOLDS.buffer.keepSec,
  newId: randomUUID,
  seed: await repo.loadOpenSightings(Date.now() / 1000 - THRESHOLDS.buffer.keepSec),
});

// Provider clock of the latest successful poll; drives track windows.
let lastPollNow: number | null = null;
const nowSec = () => lastPollNow ?? Date.now() / 1000;

const saveFollows = () =>
  repo.saveFollows(follows.list()).catch((err: unknown) => app.log.error({ err }, "Could not save the follow list"));
const broadcastFollows = () => {
  hub.broadcast(...followsMessage(follows));
  void saveFollows();
};

/** One successful adsb.lol response (Sydney poll or followed flights): detect, persist, broadcast. */
function handlePoll(parsed: ParsedResponse, label: string) {
  const result = pipeline.handle(parsed);
  lastPollNow = result.now;
  for (const [event, data] of changeMessages(result.changes)) hub.broadcast(event, data);
  const [event, data] = snapshotMessage({ store, lifecycle, feedStatus: poller.status().feedStatus, now: result.now });
  hub.broadcast(event, data);
  if (follows.applyEvents([...result.changes.opened, ...result.changes.updated])) broadcastFollows();
  const { opened, updated, closed } = result.changes;
  app.log.debug(
    {
      aircraft: result.aircraftCount,
      newPositions: result.newPositions,
      skipped: result.skipped,
      events: { opened: opened.length, updated: updated.length, closed: closed.length },
      streamClients: hub.size,
    },
    label,
  );
}

const poller = createPoller({
  intervalMs: env.POLL_INTERVAL_MS,
  maxBackoffMs: THRESHOLDS.poll.maxBackoffMs,
  downAfterFailures: THRESHOLDS.poll.downAfterFailures,
  run: async () => {
    handlePoll(await client.fetchPoint({ ...THRESHOLDS.poll.centre, radiusNm: THRESHOLDS.poll.radiusNm }), "Poll ok");
  },
  onError: (err, consecutiveFailures) => {
    const detail = err instanceof ProviderError ? { kind: err.kind, status: err.status, message: err.message } : { err };
    app.log.warn({ ...detail, consecutiveFailures }, "Poll failed; keeping last known positions");
  },
  onStatusChange: (status) => {
    app.log.info({ feedStatus: status.feedStatus }, "Feed status changed");
    const [event, data] = statusMessage(status);
    hub.broadcast(event, data);
  },
});

// Followed flights, worldwide: one adsb.lol request for all of them (SPEC 11.11).
const followPoller = createPoller({
  intervalMs: THRESHOLDS.follow.intervalMs,
  maxBackoffMs: THRESHOLDS.poll.maxBackoffMs,
  downAfterFailures: THRESHOLDS.poll.downAfterFailures,
  run: async () => {
    if (follows.expire(nowSec()).length) broadcastFollows();
    const hexes = follows.hexes();
    if (hexes.length) handlePoll(await client.fetchHexes(hexes), "Follow poll ok");
  },
  onError: (err, consecutiveFailures) => {
    const detail = err instanceof ProviderError ? { kind: err.kind, status: err.status, message: err.message } : { err };
    app.log.warn({ ...detail, consecutiveFailures }, "Follow poll failed; keeping last known positions");
  },
});

// Australia-wide overview from OpenSky (SPEC 5.8, 11.10). Off unless both credentials are set.
const overviewStore = new OverviewStore();
const overviewPoller =
  env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET
    ? (() => {
        const openSky = createOpenSkyClient({
          tokens: createTokenProvider({ clientId: env.OPENSKY_CLIENT_ID, clientSecret: env.OPENSKY_CLIENT_SECRET }),
          userAgent: env.ADSB_USER_AGENT,
          timeoutMs: THRESHOLDS.overview.timeoutMs,
        });
        const broadcastOverview = (feedStatus: Parameters<typeof overviewMessage>[1]) => {
          const [event, data] = overviewMessage(overviewStore, feedStatus);
          hub.broadcast(event, data);
        };
        return createPoller({
          intervalMs: THRESHOLDS.overview.intervalMs,
          maxBackoffMs: THRESHOLDS.overview.maxBackoffMs,
          downAfterFailures: THRESHOLDS.poll.downAfterFailures,
          run: async () => {
            const parsed = await openSky.fetchStates(THRESHOLDS.overview.bbox);
            const { aircraft, skipped } = adaptStates(parsed);
            overviewStore.set(parsed.time, aircraft);
            broadcastOverview("ok");
            app.log.debug({ aircraft: aircraft.length, skipped }, "Overview poll ok");
          },
          onError: (err, consecutiveFailures) => {
            const detail =
              err instanceof ProviderError
                ? { kind: err.kind, status: err.status, retryAfterSec: err.retryAfterSec, message: err.message }
                : { err };
            app.log.warn({ ...detail, consecutiveFailures }, "Overview poll failed; keeping the last overview");
          },
          onStatusChange: (s) => {
            app.log.info({ feedStatus: s.feedStatus }, "Overview feed status changed");
            broadcastOverview(s.feedStatus);
          },
        });
      })()
    : null;

const app = buildApp({
  store,
  lifecycle,
  repo,
  hub,
  sightings,
  follows,
  onFollowsChanged: () => void saveFollows(),
  overview: overviewPoller ? { store: overviewStore, status: overviewPoller.status } : null,
  status: poller.status,
  nowSec,
  corsOrigin: env.CORS_ORIGIN,
  logger: { level: env.LOG_LEVEL },
});

const writer = createWriter(repo, THRESHOLDS.writer, app.log);
const pipeline = createPipeline({ store, engine, writer, sightings });
const client = createAdsbLolClient({
  baseUrl: env.ADSB_BASE_URL,
  userAgent: env.ADSB_USER_AGENT,
  timeoutMs: THRESHOLDS.poll.timeoutMs,
});

const summary = await hydrate({ repo, store, lifecycle, nowSec: Date.now() / 1000, thresholds: THRESHOLDS });
writer.addEvents(summary.closedEvents);
app.log.info(
  { aircraft: summary.aircraft, positions: summary.positions, restoredEvents: summary.restoredEvents, closedEvents: summary.closedEvents.length },
  "Buffer hydrated from Postgres",
);

await app.listen({ port: env.PORT, host: env.HOST });
writer.start();
hub.start();
poller.start();
followPoller.start();
if (overviewPoller) overviewPoller.start();
else app.log.info("OpenSky credentials not set; Australia-wide overview is off");

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  await poller.stop();
  await followPoller.stop();
  await overviewPoller?.stop();
  hub.stop();
  await writer.stop();
  await app.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
