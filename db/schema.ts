import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, sqliteView, text } from "drizzle-orm/sqlite-core";

/** Short-lived receipt rows support deduplication; long-term reports use counts. */
export const growthUsageEvents = sqliteTable("growth_usage_events", {
  id: text("id").primaryKey(),
  visitorHash: text("visitor_hash").notNull(),
  day: text("day").notNull(),
  event: text("event").notNull(),
  view: text("view").notNull(),
  city: text("city").notNull().default(""),
  source: text("source").notNull().default("direct"),
  minuteBucket: integer("minute_bucket").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [
  index("growth_usage_created_idx").on(table.createdAt),
  check("growth_usage_event_check", sql`${table.event} IN ('page_view','coordinate_copy','share')`),
  check("growth_usage_view_check", sql`${table.view} IN ('live','raids','calendar','pokemon','city','event')`),
  check("growth_usage_source_check", sql`${table.source} IN ('direct','dc','inven','naver','kakao','discord','youtube','instagram','other')`),
]);

export const growthDailyAggregates = sqliteTable("growth_daily_aggregates", {
  day: text("day").notNull(),
  event: text("event").notNull(),
  view: text("view").notNull(),
  city: text("city").notNull().default(""),
  source: text("source").notNull().default("direct"),
  count: integer("count").notNull().default(0),
}, table => [
  primaryKey({ columns: [table.day, table.event, table.view, table.city, table.source] }),
  check("growth_aggregate_count_check", sql`${table.count} >= 0`),
  check("growth_aggregate_event_check", sql`${table.event} IN ('page_view','coordinate_copy','share','unique_visitor','returning_visitor_7d')`),
]);

export const growthDailyVisitors = sqliteTable("growth_daily_visitors", {
  day: text("day").notNull(),
  visitorHash: text("visitor_hash").notNull(),
  source: text("source").notNull().default("direct"),
  returning7d: integer("returning_7d").notNull().default(0),
}, table => [
  primaryKey({ columns: [table.day, table.visitorHash] }),
  index("growth_visitors_hash_day_idx").on(table.visitorHash, table.day),
  check("growth_visitors_returning_check", sql`${table.returning7d} IN (0,1)`),
]);

export const growthRateLimits = sqliteTable("growth_rate_limits", {
  visitorHash: text("visitor_hash").notNull(),
  kind: text("kind").notNull(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, table => [
  primaryKey({ columns: [table.visitorHash, table.kind, table.windowStart] }),
  index("growth_rate_expiry_idx").on(table.expiresAt),
  check("growth_rate_kind_check", sql`${table.kind} IN ('usage','feedback')`),
  check("growth_rate_count_check", sql`${table.count} >= 0`),
]);

export const growthFeedback = sqliteTable("growth_feedback", {
  id: text("id").primaryKey(),
  visitorHash: text("visitor_hash").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  page: text("page").notNull(),
  city: text("city").notNull().default(""),
  hourBucket: integer("hour_bucket").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [
  index("growth_feedback_created_idx").on(table.createdAt),
  check("growth_feedback_category_check", sql`${table.category} IN ('bug','suggestion','data')`),
  check("growth_feedback_page_check", sql`${table.page} IN ('live','raids','calendar','pokemon','city','event')`),
  check("growth_feedback_message_check", sql`length(${table.message}) BETWEEN 20 AND 2000`),
]);

/** Aggregates survive deletion of 30-day anonymous visitor history. */
export const growthDailySummary = sqliteView("growth_daily_summary", {
  day: text("day"), source: text("source"), pageViews: integer("page_views"),
  coordinateCopies: integer("coordinate_copies"), shares: integer("shares"),
  uniqueVisitors: integer("unique_visitors"), returningVisitors7d: integer("returning_visitors_7d"),
  returningRate7dPercent: integer("returning_rate_7d_percent"),
}).as(sql`SELECT day, source,
  SUM(CASE WHEN event = 'page_view' THEN count ELSE 0 END) AS page_views,
  SUM(CASE WHEN event = 'coordinate_copy' THEN count ELSE 0 END) AS coordinate_copies,
  SUM(CASE WHEN event = 'share' THEN count ELSE 0 END) AS shares,
  SUM(CASE WHEN event = 'unique_visitor' THEN count ELSE 0 END) AS unique_visitors,
  SUM(CASE WHEN event = 'returning_visitor_7d' THEN count ELSE 0 END) AS returning_visitors_7d,
  CASE WHEN SUM(CASE WHEN event = 'unique_visitor' THEN count ELSE 0 END) = 0 THEN 0.0
    ELSE ROUND(100.0 * SUM(CASE WHEN event = 'returning_visitor_7d' THEN count ELSE 0 END)
      / SUM(CASE WHEN event = 'unique_visitor' THEN count ELSE 0 END), 2) END AS returning_rate_7d_percent
  FROM growth_daily_aggregates GROUP BY day, source`);

/** Operator-only D1 console view; it is never exposed through a public route. */
export const feedbackInbox = sqliteView("feedback_inbox", {
  id: text("id"), category: text("category"), message: text("message"), page: text("page"),
  city: text("city"), createdAtKst: text("created_at_kst"),
}).as(sql`SELECT id, category, message, page, city,
  datetime(created_at, 'unixepoch', '+9 hours') AS created_at_kst
  FROM growth_feedback ORDER BY created_at DESC, id DESC`);
