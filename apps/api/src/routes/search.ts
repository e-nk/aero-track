import { parseSearch } from "@aerotrack/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";

// GET /api/search (SPEC 11.7, 12.6).

const MAX_TYPE_RESULTS = 50;
const RECENT_SEC = 86_400; // stored aircraft seen within a day show "last seen N min ago"

type MatchedBy = "callsign" | "flight_prefix" | "registration" | "type";
interface Result {
  hex: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  matchedBy: MatchedBy;
  freshness: string;
  source: "detailed" | "overview" | "history";
}

const MISS_FLIGHT = "No live aircraft found for this flight number. The callsign may differ.";
const MISS = "We can't see this aircraft right now. That doesn't mean the flight isn't operating.";

const dashless = (s: string | null) => s?.replace(/-/g, "").toUpperCase() ?? null;

export const searchRoutes =
  ({ store, overview, repo, nowSec }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/search", async (req, reply) => {
      const { q } = z.object({ q: z.string().default("") }).parse(req.query);
      const parsed = parseSearch(q);
      if (!parsed) return reply.code(400).send({ error: "bad_request", message: "Search for 2 to 20 characters." });

      const viaPrefix = new Set(parsed.flightCallsigns.map((c) => c.callsign));
      const matchCallsign = (cs: string | null): MatchedBy | null =>
        !cs ? null : cs === parsed.callsign ? "callsign" : viaPrefix.has(cs) ? "flight_prefix" : null;
      const results = new Map<string, Result>();

      // 1. Detailed live set: callsign, flight prefix, registration, type.
      let typeHits = 0;
      for (const s of store.all()) {
        let by = matchCallsign(s.callsign);
        if (!by && dashless(s.registration) === parsed.registration) by = "registration";
        if (!by && parsed.typeCode && s.typeCode === parsed.typeCode && typeHits < MAX_TYPE_RESULTS) {
          by = "type";
          typeHits++;
        }
        if (by) results.set(s.hex, { hex: s.hex, callsign: s.callsign, registration: s.registration, typeCode: s.typeCode, matchedBy: by, freshness: "live", source: "detailed" });
      }

      // 2. Australia-wide overview (callsign only: no registration or type there).
      for (const a of overview?.store.all() ?? []) {
        const by = matchCallsign(a.callsign);
        if (by && !results.has(a.hex)) {
          results.set(a.hex, { hex: a.hex, callsign: a.callsign, registration: null, typeCode: null, matchedBy: by, freshness: "live", source: "overview" });
        }
      }

      // 3. Stored aircraft: when we last saw them.
      const now = nowSec();
      for (const a of await repo.findAircraft([parsed.callsign, ...viaPrefix], parsed.registration)) {
        if (results.has(a.hex)) continue;
        const by = matchCallsign(a.callsign) ?? "registration";
        const age = a.lastSeenAt === undefined ? Infinity : now - a.lastSeenAt;
        results.set(a.hex, {
          hex: a.hex,
          callsign: a.callsign,
          registration: a.registration,
          typeCode: a.typeCode,
          matchedBy: by,
          freshness: age <= RECENT_SEC ? `last_seen_${Math.max(1, Math.round(age / 60))}m` : "not_seen",
          source: "history",
        });
      }

      const list = [...results.values()].sort((a, b) => Number(b.freshness === "live") - Number(a.freshness === "live"));
      return {
        query: parsed.query,
        results: list,
        message: list.length ? null : parsed.flightCallsigns.length ? MISS_FLIGHT : MISS,
      };
    });
  };
