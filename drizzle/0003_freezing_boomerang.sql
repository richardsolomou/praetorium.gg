CREATE TABLE "practice_opponents" (
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_opponents" ADD CONSTRAINT "practice_opponents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--
-- The practice opponents every instance has.
--
-- Seeded here rather than by the app on the way up so that an instance cannot
-- serve a battle screen that offers a seat no account exists for. Both rows are
-- accounts with no `account` row behind them, so neither can ever authenticate:
-- the only way their side is played is by the people sitting across from them.
-- The reserved `.invalid` domain cannot receive mail, so nothing addressed to
-- one of these ever leaves the instance.
--
INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
VALUES
	('practice-opponent-1', 'Practice Opponent', 'practice-opponent-1@praetorium.invalid', false, NULL, now(), now()),
	('practice-opponent-2', 'Practice Opponent II', 'practice-opponent-2@praetorium.invalid', false, NULL, now(), now())
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "practice_opponents" ("user_id")
VALUES ('practice-opponent-1'), ('practice-opponent-2')
ON CONFLICT DO NOTHING;
