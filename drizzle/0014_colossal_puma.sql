CREATE TABLE "league_event_battles" (
	"battle_id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_event_battles" ADD CONSTRAINT "league_event_battles_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_event_battles" ADD CONSTRAINT "league_event_battles_event_id_league_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."league_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "league_event_battles" ("battle_id", "event_id")
SELECT DISTINCT "commands"."battle_id", "league_events"."id"
FROM "commands"
INNER JOIN "leagues" ON "leagues"."token" = "commands"."body"::jsonb ->> 'leagueToken'
INNER JOIN "league_events" ON "league_events"."league_id" = "leagues"."id"
	AND "league_events"."token" = coalesce("commands"."body"::jsonb ->> 'eventToken', "commands"."body"::jsonb ->> 'leagueToken')
WHERE "commands"."body"::jsonb ->> 'kind' = 'lock-league-rosters'
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE INDEX "league_event_battles_event_id_index" ON "league_event_battles" USING btree ("event_id");
