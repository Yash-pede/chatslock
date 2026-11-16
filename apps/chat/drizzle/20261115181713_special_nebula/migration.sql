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
