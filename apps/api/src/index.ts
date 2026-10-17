import { randomUUID } from "node:crypto";
import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS } from "@aerotrack/shared";
import { buildApp } from "./app";
import { AircraftStore } from "./buffer";
import { createDb } from "./db/client";
import { createPgRepo } from "./db/repo";
import { loadDotEnv, loadEnv } from "./env";
import { createEventEngine } from "./eventEngine";
import { hydrate } from "./hydrate";
import { createPipeline } from "./pipeline";
import { createPoller } from "./poller";
import { ProviderError, createAdsbLolClient } from "./providers/adsblol/client";
import { OverviewStore } from "./overview/overviewStore";
import { adaptStates } from "./providers/opensky/adapter";
import { createOpenSkyClient, createTokenProvider } from "./providers/opensky/client";
import { SightingTracker } from "./sightings";
import { SseHub } from "./sse";
import { changeMessages, overviewMessage, snapshotMessage, statusMessage } from "./streamMessages";
import { createWriter } from "./writer";

loadDotEnv();
const env = loadEnv();

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const repo = createPgRepo(db);
const store = new AircraftStore(THRESHOLDS);
const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: randomUUID });
const engine = createEventEngine({ store, lifecycle, thresholds: THRESHOLDS });
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

const poller = createPoller({
  intervalMs: env.POLL_INTERVAL_MS,
  maxBackoffMs: THRESHOLDS.poll.maxBackoffMs,
  downAfterFailures: THRESHOLDS.poll.downAfterFailures,
  run: async () => {
    const parsed = await client.fetchPoint({ ...THRESHOLDS.poll.centre, radiusNm: THRESHOLDS.poll.radiusNm });
    const result = pipeline.handle(parsed);
    lastPollNow = result.now;
    for (const [event, data] of changeMessages(result.changes)) hub.broadcast(event, data);
    const [event, data] = snapshotMessage({ store, lifecycle, feedStatus: "ok", now: result.now });
    hub.broadcast(event, data);
    const { opened, updated, closed } = result.changes;
    app.log.debug(
      {
        aircraft: result.aircraftCount,
        newPositions: result.newPositions,
        skipped: result.skipped,
        events: { opened: opened.length, updated: updated.length, closed: closed.length },
        streamClients: hub.size,
      },
      "Poll ok",
    );
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
if (overviewPoller) overviewPoller.start();
else app.log.info("OpenSky credentials not set; Australia-wide overview is off");

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  await poller.stop();
  await overviewPoller?.stop();
  hub.stop();
  await writer.stop();
  await app.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
