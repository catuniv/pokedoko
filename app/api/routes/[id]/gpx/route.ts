import { env } from "cloudflare:workers";
import { handleCommunityRouteGpx } from "../../../../../lib/community-routes-server";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleCommunityRouteGpx((await context.params).id, env.DB);
}
