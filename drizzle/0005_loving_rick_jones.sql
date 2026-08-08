--> Guests are gone: an account is now the only way to be anyone here, so the rows
--> that belonged to a cookie go with them. Battles are deleted first, because a
--> battle whose seats all belonged to guests would otherwise be left with nobody
--> in it. Everything else — seats, commands, rosters, collections — cascades off
--> `players`.
DELETE FROM `battles` WHERE `id` IN (
	SELECT `battle_id` FROM `battle_players` WHERE `player_id` IN (SELECT `id` FROM `players` WHERE `user_id` IS NULL)
);--> statement-breakpoint
DELETE FROM `players` WHERE `user_id` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_players`("id", "name", "user_id", "created_at") SELECT "id", "name", "user_id", "created_at" FROM `players`;--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
ALTER TABLE `__new_players` RENAME TO `players`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `players_user_id_unique` ON `players` (`user_id`);--> statement-breakpoint
CREATE INDEX `players_user_id_index` ON `players` (`user_id`);
