CREATE TABLE `rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`catalogue_id` text NOT NULL,
	`detachment_id` text,
	`limit` integer NOT NULL,
	`picks` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rosters_player_id_index` ON `rosters` (`player_id`);