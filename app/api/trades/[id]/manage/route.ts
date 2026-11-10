import { env } from "cloudflare:workers";
import { handleTradeManage } from "../../../../../lib/trades-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleTradeManage((await context.params).id, request, env.DB); }
