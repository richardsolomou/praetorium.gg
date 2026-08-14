ALTER TABLE `rosters` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `rosters` ADD `visibility` text DEFAULT 'unlisted' NOT NULL;--> statement-breakpoint
ALTER TABLE `rosters` ADD `source` text DEFAULT 'legacy' NOT NULL;
