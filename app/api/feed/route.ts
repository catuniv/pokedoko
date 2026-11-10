import { loadFeed } from '../../../lib/feed';

export async function GET() {
  return Response.json(await loadFeed(), { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } });
}
