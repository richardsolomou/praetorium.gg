CREATE TABLE "user_onboarding" (
	"user_id" text PRIMARY KEY NOT NULL,
	"completed_tasks" text DEFAULT '[]' NOT NULL,
	"skipped_tasks" text DEFAULT '[]' NOT NULL,
	"welcomed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;