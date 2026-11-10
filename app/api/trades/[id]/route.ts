import { env } from "cloudflare:workers";
import { handleTradeGet } from "../../../../lib/trades-server";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { return handleTradeGet((await context.params).id, env.DB); }
