import { preprocess } from "@aerotrack/detectors";
import { THRESHOLDS } from "@aerotrack/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";

const RECENT_EVENTS_LIMIT = 20;
const SIGHTING_WINDOW_SEC = 7 * 86400;
const MAX_TRACK_MINUTES = THRESHOLDS.buffer.keepSec / 60; // the buffer holds 15 minutes

const HexParams = z.object({ hex: z.string().min(1) });
const TrackQuery = z.object({
  minutes: z.coerce.number().int().min(1).max(MAX_TRACK_MINUTES).default(MAX_TRACK_MINUTES),
});

const notFound = (reply: FastifyReply) =>
  reply.code(404).send({
    error: "not_found",
    message: "We can't see this aircraft right now. That doesn't mean the flight isn't operating.",
  });

export const aircraftRoutes =
  ({ store, lifecycle, repo, sightings, nowSec }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    /** Counts from the database, plus the current sighting if it hasn't been written yet. */
    async function sightingCounts(hex: string) {
      const since = nowSec() - SIGHTING_WINDOW_SEC;
      const summary = await repo.sightingSummary(hex, since);
      const open = sightings.current(hex);
      const unsaved = open && !summary.recentIds.includes(open.id) ? open : null;
      const firstSeenAt = [summary.firstSeenAt, unsaved?.startedAt].filter((t): t is number => t != null);
      return {
        last7Days: summary.recentIds.length + (unsaved ? 1 : 0),
        total: summary.total + (unsaved ? 1 : 0),
        firstSeenAt: firstSeenAt.length ? Math.min(...firstSeenAt) : null,
      };
    }

    app.get("/aircraft", async () => store.all());

    app.get("/aircraft/:hex", async (req, reply) => {
      const { hex } = HexParams.parse(req.params);
      const state = store.get(hex);
      if (!state) return notFound(reply);
      return {
        state,
        // Same rule the detectors use: insights need about a minute of clean history.
        history: preprocess(store.track(hex), THRESHOLDS).status,
        openEvents: lifecycle.openEvents(hex),
        recentEvents: await repo.recentEvents(hex, RECENT_EVENTS_LIMIT),
        sightings: await sightingCounts(hex),
      };
    });

    app.get("/aircraft/:hex/track", async (req, reply) => {
      const { hex } = HexParams.parse(req.params);
      const query = TrackQuery.safeParse(req.query);
      if (!query.success) {
        return reply.code(400).send({ error: "bad_request", message: `minutes must be 1 to ${MAX_TRACK_MINUTES}` });
      }
      if (!store.get(hex)) return notFound(reply);

      const since = nowSec() - query.data.minutes * 60;
      // Clean segments (glitches and impossible jumps removed), split at gaps so
      // the map never draws a line across missing data.
      const { segments } = preprocess(store.track(hex, since), THRESHOLDS);
      return { segments };
    });
  };
