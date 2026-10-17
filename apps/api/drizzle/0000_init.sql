CREATE TABLE "aircraft" (
	"hex" text PRIMARY KEY NOT NULL,
	"callsign" text,
	"registration" text,
	"type_code" text,
	"type_desc" text,
	"category" text,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hex" text NOT NULL,
	"type" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"explanation" jsonb NOT NULL,
	"explanation_source" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hex" text NOT NULL,
	"t" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"alt_ft" integer,
	"on_ground" boolean NOT NULL,
	"gs_kt" real,
	"track_deg" real,
	"baro_rate_fpm" integer,
	"squawk" text,
	"mode" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"attribution" text NOT NULL,
	"captured_from" timestamp with time zone NOT NULL,
	"captured_to" timestamp with time zone NOT NULL,
	"file_url" text NOT NULL,
	"reported_cause" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_hex_opened_at_idx" ON "events" USING btree ("hex","opened_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_hex_t_idx" ON "positions" USING btree ("hex","t");--> statement-breakpoint
CREATE INDEX "positions_t_idx" ON "positions" USING btree ("t");