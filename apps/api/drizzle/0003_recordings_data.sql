ALTER TABLE "recordings" ALTER COLUMN "file_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "aircraft_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "data" jsonb NOT NULL;