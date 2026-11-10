import { env } from "cloudflare:workers";
import { handleCommunityRoutePlacesGet } from "../../../../lib/community-routes-server";
export async function GET(request: Request) { return handleCommunityRoutePlacesGet(request, env.DB); }
