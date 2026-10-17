import type { Explanation } from "@aerotrack/shared";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// SPEC 11.6. All times are timestamptz.
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const aircraft = pgTable("aircraft", {
  hex: text("hex").primaryKey(),
  callsign: text("callsign"),
  registration: text("registration"),
  typeCode: text("type_code"),
  typeDesc: text("type_desc"),
  category: text("category"),
  lastSeenAt: ts("last_seen_at").notNull(),
});

export const positions = pgTable(
  "positions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hex: text("hex").notNull(),
    t: ts("t").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    altFt: integer("alt_ft"),
    onGround: boolean("on_ground").notNull(),
    gsKt: real("gs_kt"),
    trackDeg: real("track_deg"),
    baroRateFpm: integer("baro_rate_fpm"),
    squawk: text("squawk"),
    mode: text("mode").notNull(),
  },
  (table) => [
    // Unique so re-inserting the same position (e.g. after a restart) is a no-op.
    uniqueIndex("positions_hex_t_idx").on(table.hex, table.t),
    index("positions_t_idx").on(table.t),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    hex: text("hex").notNull(),
    type: text("type").notNull(),
    confidence: text("confidence").notNull(),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    windowStart: ts("window_start").notNull(),
    windowEnd: ts("window_end").notNull(),
    evidence: jsonb("evidence").$type<Record<string, number | string | boolean>>().notNull(),
    explanation: jsonb("explanation").$type<Explanation>().notNull(),
    explanationSource: text("explanation_source").notNull(),
    openedAt: ts("opened_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
    closedAt: ts("closed_at"),
  },
  (table) => [index("events_hex_opened_at_idx").on(table.hex, table.openedAt), index("events_status_idx").on(table.status)],
);

export const recordings = pgTable("recordings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  attribution: text("attribution").notNull(),
  capturedFrom: ts("captured_from").notNull(),
  capturedTo: ts("captured_to").notNull(),
  fileUrl: text("file_url").notNull(),
  reportedCause: jsonb("reported_cause").$type<{ text: string; sourceUrl: string; sourceName: string }>(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// "Seen by AeroTrack" (SPEC 11.9). Never deleted by retention.
export const sightings = pgTable(
  "sightings",
  {
    id: uuid("id").primaryKey(),
    hex: text("hex").notNull(),
    startedAt: ts("started_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    tookOffAt: ts("took_off_at"),
    takeoffAirport: text("takeoff_airport"),
    landedAt: ts("landed_at"),
    landingAirport: text("landing_airport"),
  },
  (table) => [index("sightings_hex_started_at_idx").on(table.hex, table.startedAt), index("sightings_last_seen_at_idx").on(table.lastSeenAt)],
);

// Followed flights (SPEC 11.11), so a restart doesn't drop a flight mid-ocean.
export const follows = pgTable("follows", {
  hex: text("hex").primaryKey(),
  addedAt: ts("added_at").notNull(),
  landedAt: ts("landed_at"),
});
