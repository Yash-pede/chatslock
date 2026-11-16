CREATE TABLE `conversations` (
	`owner_user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`conversation_type` text NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT `conversations_pk` PRIMARY KEY(`owner_user_id`, `conversation_id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY,
	`username` text NOT NULL,
	`full_name` text NOT NULL,
	`avatar` text,
	`last_active_at` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_owner_position_idx` ON `conversations` (`owner_user_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_idx` ON `profiles` (`username`);