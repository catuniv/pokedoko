ALTER TABLE `trade_posts` ADD `offer_background_kind` text;--> statement-breakpoint
ALTER TABLE `trade_posts` ADD `offer_background_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `trade_posts` ADD `want_background_kind` text;--> statement-breakpoint
ALTER TABLE `trade_posts` ADD `want_background_name` text DEFAULT '' NOT NULL;