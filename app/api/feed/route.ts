import { env } from 'cloudflare:workers';
import { FALLBACK_FEED, loadFeed } from '../../../lib/feed';
import { createFeedStore } from '../../../lib/feed-store';

const sharedFeed = createFeedStore({ load: loadFeed, fallback: FALLBACK_FEED });

export async function GET(request: Request) {
  const result = await sharedFeed(env.BUCKET);
  const statusOnly = new URL(request.url).searchParams.get('status') === '1';
  const body = statusOnly ? {
    ok: !result.feed.error,
    events: result.feed.events.length,
    bosses: result.feed.bosses.length,
    fetchedAt: result.feed.fetchedAt,
    source: result.feed.source,
    error: result.feed.error,
    storage: result.storage,
    cache: result.cache,
    storedAt: result.storedAt ?? null,
  } : result.feed;
  return Response.json(body, { headers: {
    'Cache-Control': 'no-store',
    'X-Pokedoko-Feed-Cache': result.cache,
    'X-Pokedoko-Feed-Storage': result.storage,
    ...(result.storedAt ? { 'X-Pokedoko-Feed-Stored-At': result.storedAt } : {}),
  } });
}
