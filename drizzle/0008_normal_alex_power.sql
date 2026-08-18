CREATE TABLE `favourite_factions` (
	`player_id` text NOT NULL,
	`catalogue_id` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`player_id`, `catalogue_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
