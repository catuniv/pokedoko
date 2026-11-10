import { env } from "cloudflare:workers";
import { handleTradeRecovery } from "../../../../lib/trades-server";
export async function POST(request: Request) { return handleTradeRecovery(request, env.DB); }
