CREATE TABLE `trade_post_rate_limits` (
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`key`, `kind`, `window_start`),
	CONSTRAINT "trade_rate_kind_check" CHECK("trade_post_rate_limits"."kind" IN ('hour','day')),
	CONSTRAINT "trade_rate_count_check" CHECK("trade_post_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `trade_rate_expiry_idx` ON `trade_post_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `trade_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key_hash` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`trainer_name` text NOT NULL,
	`city_id` text NOT NULL,
	`mode` text NOT NULL,
	`offer_species_id` integer NOT NULL,
	`offer_shiny` integer DEFAULT 0 NOT NULL,
	`offer_form` text DEFAULT '' NOT NULL,
	`want_species_id` integer NOT NULL,
	`want_shiny` integer DEFAULT 0 NOT NULL,
	`want_form` text DEFAULT '' NOT NULL,
	`contact_kind` text NOT NULL,
	`contact_value` text NOT NULL,
	`contact_public_consent` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`hour_bucket` integer NOT NULL,
	`day_bucket` integer NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewed_at` integer,
	`published_at` integer,
	CONSTRAINT "trade_mode_check" CHECK("trade_posts"."mode" IN ('local','remote')),
	CONSTRAINT "trade_status_check" CHECK("trade_posts"."status" IN ('pending','approved','closed','removed','rejected')),
	CONSTRAINT "trade_contact_check" CHECK("trade_posts"."contact_kind" IN ('friend_code','discord','kakao') AND "trade_posts"."contact_public_consent" = 1),
	CONSTRAINT "trade_shiny_check" CHECK("trade_posts"."offer_shiny" IN (0,1) AND "trade_posts"."want_shiny" IN (0,1)),
	CONSTRAINT "trade_expiry_check" CHECK("trade_posts"."expires_at" > "trade_posts"."created_at" AND "trade_posts"."expires_at" <= "trade_posts"."created_at" + 604800),
	CONSTRAINT "trade_publication_check" CHECK("trade_posts"."status" != 'approved' OR ("trade_posts"."published_at" IS NOT NULL AND "trade_posts"."reviewed_at" IS NOT NULL AND length("trade_posts"."review_note") > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trade_owner_key_idx` ON `trade_posts` (`owner_key_hash`);--> statement-breakpoint
CREATE INDEX `trade_public_idx` ON `trade_posts` (`status`,`city_id`,`mode`,`expires_at`);--> statement-breakpoint
CREATE INDEX `trade_expiry_idx` ON `trade_posts` (`expires_at`);--> statement-breakpoint
ALTER TABLE `community_routes` ADD `reversible` integer;--> statement-breakpoint
ALTER TABLE `community_routes` ADD `estimated_minutes` integer;--> statement-breakpoint
ALTER TABLE `community_routes` ADD `is_loop` integer;
--> statement-breakpoint
CREATE TRIGGER trade_posts_admission
BEFORE INSERT ON trade_posts
WHEN COALESCE((SELECT count FROM trade_post_rate_limits WHERE key = NEW.visitor_hash AND kind = 'hour' AND window_start = NEW.hour_bucket), 0) >= 3
  OR COALESCE((SELECT count FROM trade_post_rate_limits WHERE key = 'global' AND kind = 'day' AND window_start = NEW.day_bucket), 0) >= 1000
  OR (SELECT COUNT(*) FROM trade_posts WHERE status = 'pending' AND expires_at > NEW.created_at) >= 500
BEGIN SELECT RAISE(IGNORE); END;
--> statement-breakpoint
CREATE TRIGGER trade_posts_admitted
AFTER INSERT ON trade_posts
BEGIN
  INSERT INTO trade_post_rate_limits (key,kind,window_start,count,expires_at)
    VALUES (NEW.visitor_hash,'hour',NEW.hour_bucket,1,NEW.hour_bucket+3600)
    ON CONFLICT(key,kind,window_start) DO UPDATE SET count = count + 1;
  INSERT INTO trade_post_rate_limits (key,kind,window_start,count,expires_at)
    VALUES ('global','day',NEW.day_bucket,1,NEW.day_bucket+86400)
    ON CONFLICT(key,kind,window_start) DO UPDATE SET count = count + 1;
END;
