CREATE TABLE `submission_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_submission_limits_expires_at` ON `submission_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `visitors` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`visitor_key` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_visitors_id` ON `visitors` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_visitors_visitor_key` ON `visitors` (`visitor_key`);