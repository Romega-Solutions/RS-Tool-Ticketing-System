CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`monday_status` text,
	`tuesday_status` text,
	`wednesday_status` text,
	`thursday_status` text,
	`friday_status` text,
	`notes` text,
	`submitted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `users` ADD `plane_member_id` text;