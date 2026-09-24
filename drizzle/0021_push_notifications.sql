CREATE TABLE "push_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_preferences" ADD CONSTRAINT "push_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_index" ON "push_tokens" USING btree ("user_id");