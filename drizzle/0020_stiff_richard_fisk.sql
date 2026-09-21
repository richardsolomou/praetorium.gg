CREATE TABLE "user_onboarding" (
	"user_id" text PRIMARY KEY NOT NULL,
	"welcomed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_onboarding_tasks" (
	"user_id" text NOT NULL,
	"task" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "user_onboarding_tasks_user_id_task_pk" PRIMARY KEY("user_id","task")
);
--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_tasks" ADD CONSTRAINT "user_onboarding_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;