CREATE TABLE "league_entries" (
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"joined_at" bigint NOT NULL,
	"roster_id" text,
	"roster_snapshot" text,
	"submitted_at" bigint,
	CONSTRAINT "league_entries_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"visibility" text NOT NULL,
	"admission" text NOT NULL,
	"created_at" bigint NOT NULL,
	"revealed_at" bigint
);
--> statement-breakpoint
ALTER TABLE "league_entries" ADD CONSTRAINT "league_entries_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_entries" ADD CONSTRAINT "league_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_entries_user_id_index" ON "league_entries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_token_unique" ON "leagues" USING btree ("token");--> statement-breakpoint
CREATE INDEX "leagues_visibility_created_at_index" ON "leagues" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "leagues_owner_id_created_at_index" ON "leagues" USING btree ("owner_id","created_at");