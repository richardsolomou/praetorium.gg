ALTER TABLE "rosters" ADD COLUMN "optional_rules" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "borrowed_detachment_id" text;