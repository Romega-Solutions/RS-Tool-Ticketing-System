CREATE TABLE `timesheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`clocked_in_at` text NOT NULL,
	`clocked_out_at` text,
	`duration_seconds` integer,
	`date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
