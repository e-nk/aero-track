import cors from "@fastify/cors";
import type { EventLifecycle } from "@aerotrack/detectors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { AircraftStore } from "./buffer";
import type { PollerStatus } from "./poller";
import type { Repo } from "./repo";
import { aircraftRoutes } from "./routes/aircraft";
import { healthRoutes } from "./routes/health";

export interface AppDeps {
  store: AircraftStore;
  lifecycle: EventLifecycle;
  repo: Pick<Repo, "recentEvents">;
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
  return app;
}
