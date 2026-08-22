DROP INDEX "rosters_user_id_updated_at_index";--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "created_at" bigint;--> statement-breakpoint
UPDATE "rosters" SET "created_at" = "updated_at";--> statement-breakpoint
ALTER TABLE "rosters" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "rosters_user_id_created_at_index" ON "rosters" USING btree ("user_id","created_at");
