import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../app";

export const healthRoutes =
  ({ status, store }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    // Always 200 while the process is up; feed health is reported in the body.
    app.get("/health", async () => {
      const { feedStatus, lastPollAt } = status();
      return { ok: true, feedStatus, lastPollAt, aircraftCount: store.all().length };
    });
  };
