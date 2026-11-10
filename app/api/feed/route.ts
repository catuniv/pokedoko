import { env } from 'cloudflare:workers';
import { FALLBACK_FEED, loadFeed } from '../../../lib/feed';
import { createFeedStore } from '../../../lib/feed-store';
import { getFeedStorageBinding } from '../../../lib/feed-storage-bindings';

const sharedFeed = createFeedStore({ load: loadFeed, fallback: FALLBACK_FEED });

export async function GET(request: Request) {
  const binding = getFeedStorageBinding(env);
  const storageKind = binding?.kind ?? 'none';
  const result = await sharedFeed(binding);
  const statusOnly = new URL(request.url).searchParams.get('status') === '1';
  const body = statusOnly ? {
    ok: !result.feed.error,
    events: result.feed.events.length,
    bosses: result.feed.bosses.length,
    fetchedAt: result.feed.fetchedAt,
    source: result.feed.source,
    error: result.feed.error,
    storage: result.storage,
    storageKind,
    cache: result.cache,
    storedAt: result.storedAt ?? null,
  } : result.feed;
  return Response.json(body, { headers: {
    'Cache-Control': 'no-store',
    'X-Pokedoko-Feed-Cache': result.cache,
    'X-Pokedoko-Feed-Storage': result.storage,
    'X-Pokedoko-Feed-Storage-Kind': storageKind,
    ...(result.storedAt ? { 'X-Pokedoko-Feed-Stored-At': result.storedAt } : {}),
  } });
}
