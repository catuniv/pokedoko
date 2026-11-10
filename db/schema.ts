import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, sqliteView, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

/** User-contributed game Route records stay private until an operator reviews rights and identity. */
export const communityRoutes = sqliteTable("community_routes", {
  id: text("id").primaryKey(), fingerprint: text("fingerprint").notNull(), visitorHash: text("visitor_hash").notNull(),
  name: text("name").notNull(), cityId: text("city_id").notNull(), startName: text("start_name").notNull(), endName: text("end_name").notNull().default(""),
  startLat: real("start_lat").notNull(), startLon: real("start_lon").notNull(), endLat: real("end_lat"), endLon: real("end_lon"),
  reportedDistanceM: real("reported_distance_m").notNull(), computedDistanceM: real("computed_distance_m"),
  geometryType: text("geometry_type").notNull().default("none"), geometryValidation: text("geometry_validation").notNull().default("missing"),
  reversible: integer("reversible"), estimatedMinutes: integer("estimated_minutes"), isLoop: integer("is_loop"),
  pointsJson: text("points_json"), pointCount: integer("point_count").notNull().default(0),
  sourceUrl: text("source_url").notNull().default(""), creatorName: text("creator_name").notNull(),
  rightsBasis: text("rights_basis").notNull(), rightsDetails: text("rights_details").notNull(),
  permissionConfirmed: integer("permission_confirmed").notNull(), inGameConfirmed: integer("in_game_confirmed").notNull(),
  lastCheckedAt: text("last_checked_at").notNull(), notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"), rightsReviewed: integer("rights_reviewed").notNull().default(0), routeReviewed: integer("route_reviewed").notNull().default(0),
  reviewNote: text("review_note").notNull().default(""), reviewedAt: integer("reviewed_at"), publishedAt: integer("published_at"),
  hourBucket: integer("hour_bucket").notNull(), dayBucket: integer("day_bucket").notNull(), createdAt: integer("created_at").notNull(),
  submissionPolicy: text("submission_policy").notNull(),
}, table => [
  uniqueIndex("community_route_fingerprint_idx").on(table.fingerprint),
  index("community_route_public_idx").on(table.status, table.cityId, table.publishedAt),
  check("community_route_status_check", sql`${table.status} IN ('pending','approved','rejected','removed')`),
  check("community_route_geometry_type_check", sql`${table.geometryType} IN ('none','original','estimated','reconstructed')`),
  check("community_route_geometry_validation_check", sql`(${table.geometryType} = 'none' AND ${table.geometryValidation} = 'missing' AND ${table.pointCount} = 0 AND ${table.pointsJson} IS NULL) OR (${table.geometryType} != 'none' AND ${table.geometryValidation} = 'passed' AND ${table.pointCount} BETWEEN 2 AND 2000 AND ${table.pointsJson} IS NOT NULL)`),
  check("community_route_rights_check", sql`${table.rightsBasis} IN ('creator','permission','license') AND ${table.permissionConfirmed} = 1 AND ${table.inGameConfirmed} = 1`),
  check("community_route_start_check", sql`${table.startLat} BETWEEN -90 AND 90 AND ${table.startLon} BETWEEN -180 AND 180`),
  check("community_route_distance_check", sql`${table.reportedDistanceM} BETWEEN 100 AND 100000`),
  check("community_route_publication_check", sql`${table.status} != 'approved' OR (${table.rightsReviewed} = 1 AND ${table.routeReviewed} = 1 AND ${table.reviewedAt} IS NOT NULL AND ${table.publishedAt} IS NOT NULL AND length(${table.reviewNote}) > 0)`),
]);

/** Bounded admission counters; no IP addresses or raw visitor IDs. */
export const communityRouteRateLimits = sqliteTable("community_route_rate_limits", {
  key: text("key").notNull(), kind: text("kind").notNull(), windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0), expiresAt: integer("expires_at").notNull(),
}, table => [
  primaryKey({ columns: [table.key, table.kind, table.windowStart] }),
  index("community_route_rate_expiry_idx").on(table.expiresAt),
  check("community_route_rate_kind_check", sql`${table.kind} IN ('hour','day')`),
  check("community_route_rate_count_check", sql`${table.count} >= 0`),
]);

/** Recruitment posts, never a game inventory or trade execution service. */
export const tradePosts = sqliteTable("trade_posts", {
  id: text("id").primaryKey(), ownerKeyHash: text("owner_key_hash").notNull(), visitorHash: text("visitor_hash").notNull(),
  trainerName: text("trainer_name").notNull(), cityId: text("city_id").notNull(), mode: text("mode").notNull(), gpsCapable: integer("gps_capable"),
  offerSpeciesId: integer("offer_species_id").notNull(), offerShiny: integer("offer_shiny").notNull().default(0), offerForm: text("offer_form").notNull().default(""),
  offerBackgroundKind: text("offer_background_kind"), offerBackgroundName: text("offer_background_name").notNull().default(""),
  wantSpeciesId: integer("want_species_id").notNull(), wantShiny: integer("want_shiny").notNull().default(0), wantForm: text("want_form").notNull().default(""),
  wantBackgroundKind: text("want_background_kind"), wantBackgroundName: text("want_background_name").notNull().default(""),
  contactKind: text("contact_kind").notNull(), contactValue: text("contact_value").notNull(), contactPublicConsent: integer("contact_public_consent").notNull(),
  notes: text("notes").notNull().default(""), status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
  hourBucket: integer("hour_bucket").notNull(), dayBucket: integer("day_bucket").notNull(),
  reviewNote: text("review_note").notNull().default(""), reviewedAt: integer("reviewed_at"), publishedAt: integer("published_at"),
}, table => [
  uniqueIndex("trade_owner_key_idx").on(table.ownerKeyHash),
  index("trade_public_idx").on(table.status, table.cityId, table.mode, table.expiresAt),
  index("trade_expiry_idx").on(table.expiresAt),
  check("trade_mode_check", sql`${table.mode} IN ('local','remote')`),
  check("trade_status_check", sql`${table.status} IN ('pending','approved','closed','removed','rejected')`),
  check("trade_contact_check", sql`${table.contactKind} IN ('friend_code','discord','kakao') AND ${table.contactPublicConsent} = 1`),
  check("trade_shiny_check", sql`${table.offerShiny} IN (0,1) AND ${table.wantShiny} IN (0,1)`),
  check("trade_expiry_check", sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + 604800`),
  check("trade_publication_check", sql`${table.status} != 'approved' OR (${table.publishedAt} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND length(${table.reviewNote}) > 0)`),
]);

export const tradePostRateLimits = sqliteTable("trade_post_rate_limits", {
  key: text("key").notNull(), kind: text("kind").notNull(), windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0), expiresAt: integer("expires_at").notNull(),
}, table => [
  primaryKey({ columns: [table.key, table.kind, table.windowStart] }),
  index("trade_rate_expiry_idx").on(table.expiresAt),
  check("trade_rate_kind_check", sql`${table.kind} IN ('hour','day')`),
  check("trade_rate_count_check", sql`${table.count} >= 0`),
]);
