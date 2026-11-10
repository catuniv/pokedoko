CREATE TABLE `community_route_rate_limits` (
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`key`, `kind`, `window_start`),
	CONSTRAINT "community_route_rate_kind_check" CHECK("community_route_rate_limits"."kind" IN ('hour','day')),
	CONSTRAINT "community_route_rate_count_check" CHECK("community_route_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `community_route_rate_expiry_idx` ON `community_route_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `community_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`name` text NOT NULL,
	`city_id` text NOT NULL,
	`start_name` text NOT NULL,
	`end_name` text DEFAULT '' NOT NULL,
	`start_lat` real NOT NULL,
	`start_lon` real NOT NULL,
	`end_lat` real,
	`end_lon` real,
	`reported_distance_m` real NOT NULL,
	`computed_distance_m` real,
	`geometry_type` text DEFAULT 'none' NOT NULL,
	`geometry_validation` text DEFAULT 'missing' NOT NULL,
	`points_json` text,
	`point_count` integer DEFAULT 0 NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`creator_name` text NOT NULL,
	`rights_basis` text NOT NULL,
	`rights_details` text NOT NULL,
	`permission_confirmed` integer NOT NULL,
	`in_game_confirmed` integer NOT NULL,
	`last_checked_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rights_reviewed` integer DEFAULT 0 NOT NULL,
	`route_reviewed` integer DEFAULT 0 NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewed_at` integer,
	`published_at` integer,
	`hour_bucket` integer NOT NULL,
	`day_bucket` integer NOT NULL,
	`created_at` integer NOT NULL,
	`submission_policy` text NOT NULL,
	CONSTRAINT "community_route_status_check" CHECK("community_routes"."status" IN ('pending','approved','rejected','removed')),
	CONSTRAINT "community_route_geometry_type_check" CHECK("community_routes"."geometry_type" IN ('none','original','estimated','reconstructed')),
	CONSTRAINT "community_route_geometry_validation_check" CHECK(("community_routes"."geometry_type" = 'none' AND "community_routes"."geometry_validation" = 'missing' AND "community_routes"."point_count" = 0 AND "community_routes"."points_json" IS NULL) OR ("community_routes"."geometry_type" != 'none' AND "community_routes"."geometry_validation" = 'passed' AND "community_routes"."point_count" BETWEEN 2 AND 2000 AND "community_routes"."points_json" IS NOT NULL)),
	CONSTRAINT "community_route_rights_check" CHECK("community_routes"."rights_basis" IN ('creator','permission','license') AND "community_routes"."permission_confirmed" = 1 AND "community_routes"."in_game_confirmed" = 1),
	CONSTRAINT "community_route_start_check" CHECK("community_routes"."start_lat" BETWEEN -90 AND 90 AND "community_routes"."start_lon" BETWEEN -180 AND 180),
	CONSTRAINT "community_route_distance_check" CHECK("community_routes"."reported_distance_m" BETWEEN 100 AND 100000),
	CONSTRAINT "community_route_publication_check" CHECK("community_routes"."status" != 'approved' OR ("community_routes"."rights_reviewed" = 1 AND "community_routes"."route_reviewed" = 1 AND "community_routes"."reviewed_at" IS NOT NULL AND "community_routes"."published_at" IS NOT NULL AND length("community_routes"."review_note") > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_route_fingerprint_idx` ON `community_routes` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `community_route_public_idx` ON `community_routes` (`status`,`city_id`,`published_at`);
--> statement-breakpoint
CREATE TRIGGER community_routes_admission
BEFORE INSERT ON community_routes
WHEN COALESCE((SELECT count FROM community_route_rate_limits WHERE key = NEW.visitor_hash AND kind = 'hour' AND window_start = NEW.hour_bucket), 0) >= 3
  OR COALESCE((SELECT count FROM community_route_rate_limits WHERE key = 'global' AND kind = 'day' AND window_start = NEW.day_bucket), 0) >= 1000
  OR (SELECT COUNT(*) FROM community_routes WHERE status = 'pending') >= 500
BEGIN
  SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER community_routes_admitted
AFTER INSERT ON community_routes
BEGIN
  INSERT INTO community_route_rate_limits (key, kind, window_start, count, expires_at)
    VALUES (NEW.visitor_hash, 'hour', NEW.hour_bucket, 1, NEW.hour_bucket + 3600)
    ON CONFLICT(key,kind,window_start) DO UPDATE SET count = count + 1;
  INSERT INTO community_route_rate_limits (key, kind, window_start, count, expires_at)
    VALUES ('global', 'day', NEW.day_bucket, 1, NEW.day_bucket + 86400)
    ON CONFLICT(key,kind,window_start) DO UPDATE SET count = count + 1;
END;
