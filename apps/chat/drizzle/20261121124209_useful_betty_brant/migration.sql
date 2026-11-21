ALTER TABLE `conversations` ADD `starred` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `starred` integer DEFAULT false NOT NULL;