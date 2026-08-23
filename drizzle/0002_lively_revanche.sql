CREATE TABLE "favourite_detachments" (
	"user_id" text NOT NULL,
	"catalogue_id" text NOT NULL,
	"detachment_id" text NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "favourite_detachments_user_id_catalogue_id_detachment_id_pk" PRIMARY KEY("user_id","catalogue_id","detachment_id")
);
--> statement-breakpoint
ALTER TABLE "favourite_detachments" ADD CONSTRAINT "favourite_detachments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;