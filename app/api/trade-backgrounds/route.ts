import { env } from "cloudflare:workers";
import { getTradeBackgroundCatalog } from "../../../lib/trade-background-catalog-server";

/** Only the fixed public catalog can be refreshed; no upload or arbitrary URL input. */
export async function GET() {
  return Response.json(await getTradeBackgroundCatalog(env), { headers: {
    "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
  } });
}
