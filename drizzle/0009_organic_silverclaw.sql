CREATE TABLE `friendships` (
	`requester_id` text NOT NULL,
	`addressee_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	`accepted_at` integer,
	PRIMARY KEY(`requester_id`, `addressee_id`),
	FOREIGN KEY (`requester_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addressee_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `friendships_addressee_id_index` ON `friendships` (`addressee_id`);