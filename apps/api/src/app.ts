import cors from "@fastify/cors";
import type { EventLifecycle } from "@aerotrack/detectors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { AircraftStore } from "./buffer";
import type { PollerStatus } from "./poller";
import type { Repo } from "./repo";
import type { OverviewStore } from "./overview/overviewStore";
import type { SightingTracker } from "./sightings";
import type { SseHub } from "./sse";
import { aircraftRoutes } from "./routes/aircraft";
import { healthRoutes } from "./routes/health";
import { streamRoutes } from "./routes/stream";

export interface AppDeps {
  store: AircraftStore;
  lifecycle: EventLifecycle;
  repo: Pick<Repo, "recentEvents" | "sightingSummary">;
  hub: SseHub;
  sightings: SightingTracker;
  /** Australia-wide overview; null when OpenSky is not configured. */
  overview: { store: OverviewStore; status: () => PollerStatus } | null;
  status: () => PollerStatus;
  /** Current time for track windows, epoch seconds (the latest poll's provider clock). */
  nowSec: () => number;
  corsOrigin: string[];
  logger?: FastifyServerOptions["logger"];
}

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? true });
  app.register(cors, { origin: deps.corsOrigin, methods: ["GET"] });
  app.register(healthRoutes(deps));
  app.register(aircraftRoutes(deps), { prefix: "/api" });
  app.register(streamRoutes(deps), { prefix: "/api" });
  // Open SSE streams would otherwise keep the server from closing.
  app.addHook("preClose", async () => deps.hub.closeAll());
  return app;
}
