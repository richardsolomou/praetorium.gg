ALTER TABLE "league_event_entries" ADD COLUMN "required_limit" integer;--> statement-breakpoint
ALTER TABLE "league_events" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "league_events" ADD COLUMN "roster_limit" integer;