CREATE TABLE `battle_players` (
	`battle_id` text NOT NULL,
	`player_id` text NOT NULL,
	`side` integer NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`battle_id`, `player_id`),
	FOREIGN KEY (`battle_id`) REFERENCES `battles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `battle_players_player_id_index` ON `battle_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `battles` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `battles_token_unique` ON `battles` (`token`);--> statement-breakpoint
CREATE TABLE `commands` (
	`battle_id` text NOT NULL,
	`seq` integer NOT NULL,
	`player_id` text NOT NULL,
	`at` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`battle_id`, `seq`),
	FOREIGN KEY (`battle_id`) REFERENCES `battles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
