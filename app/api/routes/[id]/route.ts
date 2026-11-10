import { env } from "cloudflare:workers";
import { handleCommunityRouteGet } from "../../../../lib/community-routes-server";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleCommunityRouteGet((await context.params).id, env.DB);
}
