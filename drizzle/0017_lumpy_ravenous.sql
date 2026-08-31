CREATE TABLE "battle_sharing" (
	"user_id" text PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battle_sharing" ADD CONSTRAINT "battle_sharing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;