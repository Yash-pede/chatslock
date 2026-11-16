CREATE TABLE `messages` (
	`message_id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text,
	`attachment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	`pending_id` text,
	`status` text
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`,`message_id`);