CREATE TABLE "league_events" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"league_id" text NOT NULL,
	"number" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"revealed_at" bigint
);
--> statement-breakpoint
INSERT INTO "league_events" ("id", "token", "league_id", "number", "created_at", "revealed_at")
SELECT "id", "token", "id", 1, "created_at", "revealed_at" FROM "leagues";
--> statement-breakpoint
ALTER TABLE "league_entries" RENAME TO "league_event_entries";--> statement-breakpoint
ALTER TABLE "league_event_entries" RENAME COLUMN "league_id" TO "event_id";--> statement-breakpoint
ALTER TABLE "league_event_entries" DROP CONSTRAINT "league_entries_league_id_leagues_id_fk";
--> statement-breakpoint
ALTER TABLE "league_event_entries" DROP CONSTRAINT "league_entries_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "league_entries_user_id_index";--> statement-breakpoint
ALTER TABLE "league_event_entries" DROP CONSTRAINT "league_entries_league_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "league_event_entries" ADD CONSTRAINT "league_event_entries_event_id_user_id_pk" PRIMARY KEY("event_id","user_id");--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "recurring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "league_events" ADD CONSTRAINT "league_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_events_token_unique" ON "league_events" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "league_events_league_id_number_unique" ON "league_events" USING btree ("league_id","number");--> statement-breakpoint
CREATE INDEX "league_events_league_id_created_at_index" ON "league_events" USING btree ("league_id","created_at");--> statement-breakpoint
ALTER TABLE "league_event_entries" ADD CONSTRAINT "league_event_entries_event_id_league_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."league_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_event_entries" ADD CONSTRAINT "league_event_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_event_entries_user_id_index" ON "league_event_entries" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "leagues" DROP COLUMN "revealed_at";
