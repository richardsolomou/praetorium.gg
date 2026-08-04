CREATE TABLE `collection` (
	`player_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`player_id`, `entry_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
