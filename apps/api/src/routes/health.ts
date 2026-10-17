import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../app";

export const healthRoutes =
  ({ status, store, overview }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    // Always 200 while the process is up; feed health is reported in the body.
    app.get("/health", async () => {
      const { feedStatus, lastPollAt } = status();
      const o = overview?.status();
      return {
        ok: true,
        feedStatus,
        lastPollAt,
        aircraftCount: store.all().length,
        overview:
          overview && o
            ? { enabled: true, feedStatus: o.feedStatus, fetchedAt: overview.store.fetchedAt, aircraftCount: overview.store.size }
            : { enabled: false },
      };
    });
  };
