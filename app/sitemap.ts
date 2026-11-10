import { CITIES } from "@/lib/cities";
import { loadFeed } from "@/lib/feed";
import { withOfficialEvents } from "@/lib/official-events";
import { buildSitemap } from "@/lib/site-metadata";

export default async function sitemap() {
  const feed = await loadFeed();
  return buildSitemap(CITIES, withOfficialEvents(feed.events));
}
