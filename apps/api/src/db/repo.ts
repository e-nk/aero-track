import type { AircraftState, BehaviourEvent, Confidence, DataMode, EventType } from "@aerotrack/shared";
import { and, asc, count, desc, eq, gte, inArray, min, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { PositionRow, Repo } from "../repo";
import type { Sighting } from "../sightings";
import type { Db } from "./client";
import { aircraft, events, positions, sightings } from "./schema";

// Keeps each insert well under Postgres' 65,535 bind-parameter limit.
const CHUNK = 1000;

const toDate = (sec: number) => new Date(Math.round(sec * 1000));
const toSec = (d: Date) => d.getTime() / 1000;
const roundOrNull = (n: number | null) => (n === null ? null : Math.round(n));
const excluded = (col: PgColumn) => sql.raw(`excluded."${col.name}"`);

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** Last write wins when the same key appears twice in one batch. */
const latestBy = <T>(rows: T[], key: (r: T) => string) => [...new Map(rows.map((r) => [key(r), r])).values()];

type EventRow = typeof events.$inferSelect;
type SightingRow = typeof sightings.$inferSelect;

const sightingFromRow = (r: SightingRow): Sighting => ({
  id: r.id,
  hex: r.hex,
  startedAt: toSec(r.startedAt),
  lastSeenAt: toSec(r.lastSeenAt),
  tookOffAt: r.tookOffAt ? toSec(r.tookOffAt) : null,
  takeoffAirport: r.takeoffAirport,
  landedAt: r.landedAt ? toSec(r.landedAt) : null,
  landingAirport: r.landingAirport,
});

const optDate = (sec: number | null) => (sec === null ? null : toDate(sec));

function eventFromRow(r: EventRow): BehaviourEvent {
  return {
    id: r.id,
    hex: r.hex,
    type: r.type as EventType,
    confidence: r.confidence as Confidence,
    status: r.status as BehaviourEvent["status"],
    mode: r.mode as DataMode,
    windowStart: toSec(r.windowStart),
    windowEnd: toSec(r.windowEnd),
    evidence: r.evidence,
    explanation: r.explanation,
    explanationSource: r.explanationSource as BehaviourEvent["explanationSource"],
    openedAt: toSec(r.openedAt),
    updatedAt: toSec(r.updatedAt),
    closedAt: r.closedAt ? toSec(r.closedAt) : null,
  };
}

export function createPgRepo(db: Db): Repo {
  return {
    async insertPositions(rows: PositionRow[]) {
      for (const part of chunks(rows)) {
        await db
          .insert(positions)
          .values(
            part.map(({ hex, obs, squawk, mode }) => ({
              hex,
              t: toDate(obs.t),
              lat: obs.lat,
              lon: obs.lon,
              altFt: roundOrNull(obs.altFt),
              onGround: obs.onGround,
              gsKt: obs.gsKt,
              trackDeg: obs.trackDeg,
              baroRateFpm: roundOrNull(obs.baroRateFpm),
              squawk,
              mode,
            })),
          )
          .onConflictDoNothing();
      }
    },

    async upsertAircraft(states: AircraftState[]) {
      for (const part of chunks(latestBy(states, (s) => s.hex))) {
        await db
          .insert(aircraft)
          .values(
            part.map((s) => ({
              hex: s.hex,
              callsign: s.callsign,
              registration: s.registration,
              typeCode: s.typeCode,
              typeDesc: s.typeDesc,
              category: s.category,
              lastSeenAt: toDate(s.lastPosTs),
            })),
          )
          .onConflictDoUpdate({
            target: aircraft.hex,
            set: {
              callsign: excluded(aircraft.callsign),
              registration: excluded(aircraft.registration),
              typeCode: excluded(aircraft.typeCode),
              typeDesc: excluded(aircraft.typeDesc),
              category: excluded(aircraft.category),
              lastSeenAt: excluded(aircraft.lastSeenAt),
            },
          });
      }
    },

    async upsertEvents(list: BehaviourEvent[]) {
      for (const part of chunks(latestBy(list, (e) => e.id))) {
        await db
          .insert(events)
          .values(
            part.map((e) => ({
              id: e.id,
              hex: e.hex,
              type: e.type,
              confidence: e.confidence,
              status: e.status,
              mode: e.mode,
              windowStart: toDate(e.windowStart),
              windowEnd: toDate(e.windowEnd),
              evidence: e.evidence,
              explanation: e.explanation,
              explanationSource: e.explanationSource,
              openedAt: toDate(e.openedAt),
              updatedAt: toDate(e.updatedAt),
              closedAt: e.closedAt === null ? null : toDate(e.closedAt),
            })),
          )
          .onConflictDoUpdate({
            target: events.id,
            set: {
              confidence: excluded(events.confidence),
              status: excluded(events.status),
              windowStart: excluded(events.windowStart),
              windowEnd: excluded(events.windowEnd),
              evidence: excluded(events.evidence),
              explanation: excluded(events.explanation),
              explanationSource: excluded(events.explanationSource),
              updatedAt: excluded(events.updatedAt),
              closedAt: excluded(events.closedAt),
            },
          });
      }
    },

    async loadPositionsSince(sinceSec: number) {
      const rows = await db
        .select()
        .from(positions)
        .where(and(eq(positions.mode, "live"), gte(positions.t, toDate(sinceSec))))
        .orderBy(asc(positions.t));
      return rows.map((r) => ({
        hex: r.hex,
        squawk: r.squawk,
        obs: {
          t: toSec(r.t),
          lat: r.lat,
          lon: r.lon,
          altFt: r.altFt,
          onGround: r.onGround,
          gsKt: r.gsKt,
          trackDeg: r.trackDeg,
          baroRateFpm: r.baroRateFpm,
        },
      }));
    },

    async loadAircraft(hexes: string[]) {
      if (!hexes.length) return [];
      const rows = await db.select().from(aircraft).where(inArray(aircraft.hex, hexes));
      return rows.map(({ hex, callsign, registration, typeCode, typeDesc, category }) => ({
        hex,
        callsign,
        registration,
        typeCode,
        typeDesc,
        category,
      }));
    },

    async loadOpenEvents() {
      const rows = await db.select().from(events).where(eq(events.status, "open"));
      return rows.map(eventFromRow);
    },

    async upsertSightings(list: Sighting[]) {
      for (const part of chunks(latestBy(list, (s) => s.id))) {
        await db
          .insert(sightings)
          .values(
            part.map((s) => ({
              id: s.id,
              hex: s.hex,
              startedAt: toDate(s.startedAt),
              lastSeenAt: toDate(s.lastSeenAt),
              tookOffAt: optDate(s.tookOffAt),
              takeoffAirport: s.takeoffAirport,
              landedAt: optDate(s.landedAt),
              landingAirport: s.landingAirport,
            })),
          )
          .onConflictDoUpdate({
            target: sightings.id,
            set: {
              startedAt: excluded(sightings.startedAt),
              lastSeenAt: excluded(sightings.lastSeenAt),
              tookOffAt: excluded(sightings.tookOffAt),
              takeoffAirport: excluded(sightings.takeoffAirport),
              landedAt: excluded(sightings.landedAt),
              landingAirport: excluded(sightings.landingAirport),
            },
          });
      }
    },

    async loadOpenSightings(sinceSec: number) {
      const rows = await db.select().from(sightings).where(gte(sightings.lastSeenAt, toDate(sinceSec)));
      return rows.map(sightingFromRow);
    },

    async sightingSummary(hex: string, sinceSec: number) {
      const [all] = await db
        .select({ total: count(), firstSeenAt: min(sightings.startedAt) })
        .from(sightings)
        .where(eq(sightings.hex, hex));
      const recent = await db
        .select({ id: sightings.id })
        .from(sightings)
        .where(and(eq(sightings.hex, hex), gte(sightings.startedAt, toDate(sinceSec))));
      return {
        total: Number(all?.total ?? 0),
        firstSeenAt: all?.firstSeenAt ? toSec(new Date(all.firstSeenAt)) : null,
        recentIds: recent.map((r) => r.id),
      };
    },

    async recentEvents(hex: string, limit: number) {
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.hex, hex))
        .orderBy(desc(events.openedAt))
        .limit(limit);
      return rows.map(eventFromRow);
    },
  };
}
