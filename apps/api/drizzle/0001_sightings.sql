CREATE TABLE "sightings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hex" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"took_off_at" timestamp with time zone,
	"takeoff_airport" text,
	"landed_at" timestamp with time zone,
	"landing_airport" text
);
--> statement-breakpoint
CREATE INDEX "sightings_hex_started_at_idx" ON "sightings" USING btree ("hex","started_at");--> statement-breakpoint
CREATE INDEX "sightings_last_seen_at_idx" ON "sightings" USING btree ("last_seen_at");