import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../app";
import { overviewMessage, snapshotMessage, statusMessage } from "../streamMessages";

/** GET /api/stream: server-sent events (SPEC 11.8). Snapshot and status on connect. */
export const streamRoutes =
  ({ hub, store, lifecycle, status, nowSec, overview }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/stream", (req, reply) => {
      // Keep headers set by hooks (CORS), then take over the raw response.
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.raw.setHeader("content-type", "text/event-stream");
      reply.raw.setHeader("cache-control", "no-cache");
      reply.raw.setHeader("connection", "keep-alive");
      reply.raw.setHeader("x-accel-buffering", "no"); // stop proxies buffering the stream
      reply.hijack();
      reply.raw.writeHead(200);

      const client = reply.raw;
      const remove = hub.add(client);
      req.raw.on("close", remove);

      const current = status();
      const [snapshotEvent, snapshot] = snapshotMessage({ store, lifecycle, feedStatus: current.feedStatus, now: nowSec() });
      hub.send(client, snapshotEvent, snapshot);
      const [statusEvent, statusData] = statusMessage(current);
      hub.send(client, statusEvent, statusData);
      if (overview) {
        const [overviewEvent, overviewData] = overviewMessage(overview.store, overview.status().feedStatus);
        hub.send(client, overviewEvent, overviewData);
      }
    });
  };
