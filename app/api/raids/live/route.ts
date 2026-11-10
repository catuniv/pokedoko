import { loadLiveRaids } from '../../../../lib/live-raids';

export async function GET() {
  return Response.json(await loadLiveRaids(), { headers: { 'Cache-Control': 'no-store' } });
}
