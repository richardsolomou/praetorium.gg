ALTER TABLE `user` ADD `lastSeenAt` integer;--> statement-breakpoint
CREATE INDEX `user_lastSeenAt_id_idx` ON `user` (`lastSeenAt`,`id`);--> statement-breakpoint
UPDATE `user` SET `lastSeenAt` = (SELECT max(`updatedAt`) FROM `session` WHERE `session`.`userId` = `user`.`id` AND `session`.`impersonatedBy` IS NULL);
