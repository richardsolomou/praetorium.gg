CREATE TABLE "friend_invites" (
	"token" text PRIMARY KEY NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_invites_inviter_id_unique" ON "friend_invites" USING btree ("inviter_id");