import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { FALLBACK_FEED, loadFeed } from "../lib/feed";
import { createFeedStore } from "../lib/feed-store";
import { getFeedStorageBinding } from "../lib/feed-storage-bindings";
import { createGrowthRetentionScheduler, pruneGrowthData } from "../lib/growth-server";
import { getTradeBackgroundCatalog } from "../lib/trade-background-catalog-server";

const scheduledFeed = createFeedStore({ load: loadFeed, fallback: FALLBACK_FEED });
const queueGrowthRetention = createGrowthRetentionScheduler();

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    if (request.method === "GET" && new URL(request.url).pathname.replace(/\/$/, "") === "/api/feed") {
      queueGrowthRetention(env.DB, ctx);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
  /** Cron configuration lives in the standalone deployment, not the Sites manifest. */
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, _ctx: ExecutionContext) {
    const binding = getFeedStorageBinding(env);
    // Background metadata refreshes independently of the schedule source.
    const backgrounds = getTradeBackgroundCatalog(env, { force: true }).then(result => {
      if (result.stale || result.storage !== "ready" || !result.fetchedAt) throw new Error("Background catalog could not be persisted");
      console.info("[pokedoko] trade background refresh complete", {
        cron: controller.cron, count: result.presets.length, fetchedAt: result.fetchedAt, sourceUpdatedAt: result.sourceUpdatedAt,
      });
      return true;
    }).catch(() => {
      console.error("[pokedoko] trade background refresh failed");
      return false;
    });
    // Maintenance starts independently so an upstream schedule outage cannot
    // indefinitely preserve private feedback or anonymous visitor history.
    const retention = pruneGrowthData(env.DB).then(result => {
      console.info("[pokedoko] growth retention complete", result);
      return true;
    }).catch(() => {
      console.error("[pokedoko] growth retention failed");
      return false;
    });
    try {
      const result = await scheduledFeed(binding);
      if (result.feed.error || result.storage !== "ready" || !result.storedAt) throw new Error("Public schedule could not be persisted");
      console.info("[pokedoko] scheduled feed refresh complete", {
        cron: controller.cron, storageKind: binding?.kind ?? "none", cache: result.cache,
        fetchedAt: result.feed.fetchedAt, storedAt: result.storedAt,
        events: result.feed.events.length, bosses: result.feed.bosses.length,
      });
    } catch {
      console.error("[pokedoko] scheduled feed refresh failed", { cron: controller.cron, storageKind: binding?.kind ?? "none" });
      await Promise.all([retention, backgrounds]);
      // Rejection makes this invocation visibly fail in Cloudflare Cron history.
      throw new Error("Scheduled public feed refresh failed; last successful snapshot was retained");
    }
    const [retentionOk, backgroundsOk] = await Promise.all([retention, backgrounds]);
    if (!retentionOk) throw new Error("Growth retention failed");
    if (!backgroundsOk) throw new Error("Trade background catalog refresh failed; last successful snapshot was retained");
  },
};

export default worker;
