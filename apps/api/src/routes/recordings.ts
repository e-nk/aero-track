import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";
import { buildRecording } from "../recordings/export";

const MAX_WINDOW_SEC = 6 * 3600; // keeps a recording to a few MB at most

const CreateBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    from: z.number(),
    to: z.number(),
    hexes: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((b) => b.to > b.from && b.to - b.from <= MAX_WINDOW_SEC, { message: "to must be after from, within 6 hours" });

function sameToken(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recordings stored in Postgres (SPEC 8, 11.7). */
export const recordingRoutes =
  ({ repo, adminToken }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/recordings", async () => repo.listRecordings());

    app.get("/recordings/:id", async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const rec = await repo.getRecording(id);
      return rec ?? reply.code(404).send({ error: "not_found", message: "We couldn't find that recording." });
    });

    app.post("/recordings", async (req, reply) => {
      if (!adminToken) return reply.code(403).send({ error: "disabled", message: "Creating recordings is switched off." });
      const token = req.headers["x-admin-token"];
      if (!sameToken(typeof token === "string" ? token : undefined, adminToken)) {
        return reply.code(401).send({ error: "unauthorised", message: "Admin token required." });
      }
      const body = CreateBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "bad_request", message: body.error.issues[0]?.message ?? "Invalid body" });

      const { title, from, to, hexes } = body.data;
      const rows = await repo.loadPositionsBetween(from, to);
      const identities = await repo.loadAircraft([...new Set(rows.map((r) => r.hex))]);
      let rec;
      try {
        rec = buildRecording({ title, from, to, rows, identities, hexes });
      } catch (e) {
        return reply.code(422).send({ error: "empty", message: (e as Error).message });
      }
      await repo.saveRecording(rec);
      const { aircraft, ...meta } = rec;
      return reply.code(201).send({ ...meta, aircraftCount: aircraft.length });
    });
  };
