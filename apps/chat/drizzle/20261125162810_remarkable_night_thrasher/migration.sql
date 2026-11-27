CREATE TABLE `chats` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`owner_user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`conversation_type` text NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`lastMessageId` text,
	`lastMessagePreview` text,
	`lastMessageAt` integer,
	`position` integer NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	CONSTRAINT `conversations_pk` PRIMARY KEY(`owner_user_id`, `conversation_id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`uid` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`peer_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text,
	`attachment` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	`pending_id` text,
	`status` text,
	`pinned` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1,
	`isForwarded` integer DEFAULT false,
	`reply_to` text
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
CREATE TABLE `self_profile` (
	`user_id` text PRIMARY KEY,
	`username` text NOT NULL,
	`full_name` text NOT NULL,
	`avatar` text,
	`phone` text,
	`role` text NOT NULL,
	`agent_id` text,
	`last_active_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_owner_position_idx` ON `conversations` (`owner_user_id`,`position`);--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`,`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_idx` ON `profiles` (`username`);