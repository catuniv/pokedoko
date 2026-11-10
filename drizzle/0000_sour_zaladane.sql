CREATE TABLE `growth_daily_aggregates` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`view` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `event`, `view`, `city`, `source`),
	CONSTRAINT "growth_aggregate_count_check" CHECK("growth_daily_aggregates"."count" >= 0),
	CONSTRAINT "growth_aggregate_event_check" CHECK("growth_daily_aggregates"."event" IN ('page_view','coordinate_copy','share','unique_visitor','returning_visitor_7d'))
);
--> statement-breakpoint
CREATE TABLE `growth_daily_visitors` (
	`day` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`returning_7d` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `visitor_hash`),
	CONSTRAINT "growth_visitors_returning_check" CHECK("growth_daily_visitors"."returning_7d" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `growth_visitors_hash_day_idx` ON `growth_daily_visitors` (`visitor_hash`,`day`);--> statement-breakpoint
CREATE TABLE `growth_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_hash` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`page` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`hour_bucket` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "growth_feedback_category_check" CHECK("growth_feedback"."category" IN ('bug','suggestion','data')),
	CONSTRAINT "growth_feedback_page_check" CHECK("growth_feedback"."page" IN ('live','raids','calendar','pokemon','city','event')),
	CONSTRAINT "growth_feedback_message_check" CHECK(length("growth_feedback"."message") BETWEEN 20 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `growth_feedback_created_idx` ON `growth_feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `growth_rate_limits` (
	`visitor_hash` text NOT NULL,
	`kind` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`visitor_hash`, `kind`, `window_start`),
	CONSTRAINT "growth_rate_kind_check" CHECK("growth_rate_limits"."kind" IN ('usage','feedback')),
	CONSTRAINT "growth_rate_count_check" CHECK("growth_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `growth_rate_expiry_idx` ON `growth_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `growth_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_hash` text NOT NULL,
	`day` text NOT NULL,
	`event` text NOT NULL,
	`view` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`minute_bucket` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "growth_usage_event_check" CHECK("growth_usage_events"."event" IN ('page_view','coordinate_copy','share')),
	CONSTRAINT "growth_usage_view_check" CHECK("growth_usage_events"."view" IN ('live','raids','calendar','pokemon','city','event')),
	CONSTRAINT "growth_usage_source_check" CHECK("growth_usage_events"."source" IN ('direct','dc','inven','naver','kakao','discord','youtube','instagram','other'))
);
--> statement-breakpoint
CREATE INDEX `growth_usage_created_idx` ON `growth_usage_events` (`created_at`);--> statement-breakpoint
CREATE VIEW `feedback_inbox` AS SELECT id, category, message, page, city,
  datetime(created_at, 'unixepoch', '+9 hours') AS created_at_kst
  FROM growth_feedback ORDER BY created_at DESC, id DESC;--> statement-breakpoint
CREATE VIEW `growth_daily_summary` AS SELECT day, source,
  SUM(CASE WHEN event = 'page_view' THEN count ELSE 0 END) AS page_views,
  SUM(CASE WHEN event = 'coordinate_copy' THEN count ELSE 0 END) AS coordinate_copies,
  SUM(CASE WHEN event = 'share' THEN count ELSE 0 END) AS shares,
  SUM(CASE WHEN event = 'unique_visitor' THEN count ELSE 0 END) AS unique_visitors,
  SUM(CASE WHEN event = 'returning_visitor_7d' THEN count ELSE 0 END) AS returning_visitors_7d,
  CASE WHEN SUM(CASE WHEN event = 'unique_visitor' THEN count ELSE 0 END) = 0 THEN 0.0
    ELSE ROUND(100.0 * SUM(CASE WHEN event = 'returning_visitor_7d' THEN count ELSE 0 END)
      / SUM(CASE WHEN event = 'unique_visitor' THEN count ELSE 0 END), 2) END AS returning_rate_7d_percent
  FROM growth_daily_aggregates GROUP BY day, source;
--> statement-breakpoint
-- Admission and derived counters share the parent INSERT transaction.
CREATE TRIGGER growth_usage_rate_guard BEFORE INSERT ON growth_usage_events
WHEN COALESCE((SELECT count FROM growth_rate_limits
  WHERE visitor_hash = NEW.visitor_hash AND kind = 'usage' AND window_start = NEW.minute_bucket), 0) >= 30
BEGIN
  SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER growth_usage_aggregate AFTER INSERT ON growth_usage_events
BEGIN
  INSERT INTO growth_rate_limits (visitor_hash, kind, window_start, count, expires_at)
  VALUES (NEW.visitor_hash, 'usage', NEW.minute_bucket, 1, NEW.minute_bucket + 60)
  ON CONFLICT (visitor_hash, kind, window_start) DO UPDATE SET count = count + 1;
  INSERT INTO growth_daily_aggregates (day, event, view, city, source, count)
  VALUES (NEW.day, NEW.event, NEW.view, NEW.city, NEW.source, 1)
  ON CONFLICT (day, event, view, city, source) DO UPDATE SET count = count + 1;
  INSERT INTO growth_daily_visitors (day, visitor_hash, source, returning_7d)
  VALUES (NEW.day, NEW.visitor_hash, NEW.source, EXISTS (
    SELECT 1 FROM growth_daily_visitors WHERE visitor_hash = NEW.visitor_hash
      AND day >= date(NEW.day, '-7 days') AND day < NEW.day
  )) ON CONFLICT (day, visitor_hash) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER growth_unique_aggregate AFTER INSERT ON growth_daily_visitors
BEGIN
  INSERT INTO growth_daily_aggregates (day, event, view, city, source, count)
  VALUES (NEW.day, 'unique_visitor', '', '', NEW.source, 1)
  ON CONFLICT (day, event, view, city, source) DO UPDATE SET count = count + 1;
  INSERT INTO growth_daily_aggregates (day, event, view, city, source, count)
  SELECT NEW.day, 'returning_visitor_7d', '', '', NEW.source, 1 WHERE NEW.returning_7d = 1
  ON CONFLICT (day, event, view, city, source) DO UPDATE SET count = count + 1;
END;
--> statement-breakpoint
CREATE TRIGGER growth_feedback_rate_guard BEFORE INSERT ON growth_feedback
WHEN COALESCE((SELECT count FROM growth_rate_limits
  WHERE visitor_hash = NEW.visitor_hash AND kind = 'feedback' AND window_start = NEW.hour_bucket), 0) >= 3
BEGIN
  SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER growth_feedback_rate_counter AFTER INSERT ON growth_feedback
BEGIN
  INSERT INTO growth_rate_limits (visitor_hash, kind, window_start, count, expires_at)
  VALUES (NEW.visitor_hash, 'feedback', NEW.hour_bucket, 1, NEW.hour_bucket + 3600)
  ON CONFLICT (visitor_hash, kind, window_start) DO UPDATE SET count = count + 1;
END;
