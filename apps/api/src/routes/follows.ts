import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";
import { followsMessage } from "../streamMessages";

const HexParams = z.object({ hex: z.string().min(1) });

/** Follow a flight worldwide (SPEC 11.11). One shared list for every viewer. */
export const followRoutes =
  ({ follows, hub, nowSec, onFollowsChanged }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const max = () => follows.max;
    const body = () => followsMessage(follows)[1];
    const broadcast = () => {
      hub.broadcast(...followsMessage(follows));
      onFollowsChanged?.();
    };

    app.get("/follows", async () => body());

    app.post("/follows/:hex", async (req, reply) => {
      const { hex } = HexParams.parse(req.params);
      const result = follows.add(hex, nowSec());
      if (result === "invalid") return reply.code(400).send({ error: "bad_request", message: "That isn't an aircraft address." });
      if (result === "full") {
        return reply.code(409).send({ error: "full", message: `Following is full right now (${max()} flights). Try again later.` });
      }
      if (result === "added") broadcast();
      return reply.code(result === "added" ? 201 : 200).send({ result, ...body() });
    });

    app.delete("/follows/:hex", async (req, reply) => {
      const { hex } = HexParams.parse(req.params);
      if (!follows.remove(hex)) return reply.code(404).send({ error: "not_found", message: "That flight isn't being followed." });
      broadcast();
      return reply.code(204).send();
    });
  };
