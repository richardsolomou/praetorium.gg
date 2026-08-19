PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_battle_users` (
	`battle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`side` integer NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`battle_id`, `user_id`),
	FOREIGN KEY (`battle_id`) REFERENCES `battles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_battle_users` (`battle_id`, `user_id`, `side`, `joined_at`)
SELECT seats.`battle_id`, players.`user_id`, seats.`side`, seats.`joined_at`
FROM `battle_players` seats
INNER JOIN `players` ON players.`id` = seats.`player_id`;--> statement-breakpoint
CREATE TABLE `__new_collection` (
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entry_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_collection` (`user_id`, `entry_id`, `at`)
SELECT players.`user_id`, collection.`entry_id`, collection.`at`
FROM `collection`
INNER JOIN `players` ON players.`id` = collection.`player_id`;--> statement-breakpoint
CREATE TABLE `__new_commands` (
	`battle_id` text NOT NULL,
	`seq` integer NOT NULL,
	`user_id` text NOT NULL,
	`at` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`battle_id`, `seq`),
	FOREIGN KEY (`battle_id`) REFERENCES `battles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_commands` (`battle_id`, `seq`, `user_id`, `at`, `body`)
SELECT commands.`battle_id`, commands.`seq`, players.`user_id`, commands.`at`, commands.`body`
FROM `commands`
INNER JOIN `players` ON players.`id` = commands.`player_id`;--> statement-breakpoint
UPDATE `__new_commands`
SET `body` = json_set(`body`, '$.playerId', (SELECT `user_id` FROM `players` WHERE `id` = json_extract(`body`, '$.playerId')))
WHERE json_type(`body`, '$.playerId') = 'text';--> statement-breakpoint
UPDATE `__new_commands`
SET `body` = json_set(`body`, '$.firstPlayerId', (SELECT `user_id` FROM `players` WHERE `id` = json_extract(`body`, '$.firstPlayerId')))
WHERE json_type(`body`, '$.firstPlayerId') = 'text';--> statement-breakpoint
UPDATE `__new_commands`
SET `body` = json_set(`body`, '$.attackerId', (SELECT `user_id` FROM `players` WHERE `id` = json_extract(`body`, '$.attackerId')))
WHERE json_type(`body`, '$.attackerId') = 'text';--> statement-breakpoint
UPDATE `__new_commands`
SET `body` = json_set(`body`, '$.concededBy', (SELECT `user_id` FROM `players` WHERE `id` = json_extract(`body`, '$.concededBy')))
WHERE json_type(`body`, '$.concededBy') = 'text';--> statement-breakpoint
CREATE TABLE `__new_favourite_factions` (
	`user_id` text NOT NULL,
	`catalogue_id` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `catalogue_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_favourite_factions` (`user_id`, `catalogue_id`, `at`)
SELECT players.`user_id`, favourites.`catalogue_id`, favourites.`at`
FROM `favourite_factions` favourites
INNER JOIN `players` ON players.`id` = favourites.`player_id`;--> statement-breakpoint
CREATE TABLE `__new_rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`catalogue_id` text NOT NULL,
	`detachment_id` text,
	`disposition` text,
	`limit` integer NOT NULL,
	`picks` text NOT NULL,
	`prep` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`visibility` text DEFAULT 'unlisted' NOT NULL,
	`source` text DEFAULT 'legacy' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_rosters` (`id`, `user_id`, `name`, `catalogue_id`, `detachment_id`, `disposition`, `limit`, `picks`, `prep`, `tags`, `visibility`, `source`, `updated_at`)
SELECT rosters.`id`, players.`user_id`, rosters.`name`, rosters.`catalogue_id`, rosters.`detachment_id`, rosters.`disposition`, rosters.`limit`, rosters.`picks`, rosters.`prep`, rosters.`tags`, rosters.`visibility`, rosters.`source`, rosters.`updated_at`
FROM `rosters`
INNER JOIN `players` ON players.`id` = rosters.`player_id`;--> statement-breakpoint
CREATE TABLE `__new_friendships` (
	`requester_id` text NOT NULL,
	`addressee_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	`accepted_at` integer,
	PRIMARY KEY(`requester_id`, `addressee_id`),
	FOREIGN KEY (`requester_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addressee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_friendships` (`requester_id`, `addressee_id`, `requested_at`, `accepted_at`)
SELECT requester.`user_id`, addressee.`user_id`, friendships.`requested_at`, friendships.`accepted_at`
FROM `friendships`
INNER JOIN `players` requester ON requester.`id` = friendships.`requester_id`
INNER JOIN `players` addressee ON addressee.`id` = friendships.`addressee_id`;--> statement-breakpoint
DROP TABLE `battle_players`;--> statement-breakpoint
DROP TABLE `collection`;--> statement-breakpoint
DROP TABLE `commands`;--> statement-breakpoint
DROP TABLE `favourite_factions`;--> statement-breakpoint
DROP TABLE `rosters`;--> statement-breakpoint
DROP TABLE `friendships`;--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
ALTER TABLE `__new_battle_users` RENAME TO `battle_users`;--> statement-breakpoint
ALTER TABLE `__new_collection` RENAME TO `collection`;--> statement-breakpoint
ALTER TABLE `__new_commands` RENAME TO `commands`;--> statement-breakpoint
ALTER TABLE `__new_favourite_factions` RENAME TO `favourite_factions`;--> statement-breakpoint
ALTER TABLE `__new_rosters` RENAME TO `rosters`;--> statement-breakpoint
ALTER TABLE `__new_friendships` RENAME TO `friendships`;--> statement-breakpoint
CREATE INDEX `battle_users_user_id_index` ON `battle_users` (`user_id`);--> statement-breakpoint
CREATE INDEX `rosters_user_id_index` ON `rosters` (`user_id`);--> statement-breakpoint
CREATE INDEX `friendships_addressee_id_index` ON `friendships` (`addressee_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
