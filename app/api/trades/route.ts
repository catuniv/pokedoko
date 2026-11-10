import { env } from "cloudflare:workers";
import { handleTradeSubmission, handleTradesGet, tradeMethodNotAllowed } from "../../../lib/trades-server";
export async function GET(request: Request) { return handleTradesGet(request, env.DB); }
export async function POST(request: Request) { return handleTradeSubmission(request, env.DB); }
export const PUT = tradeMethodNotAllowed;
export const PATCH = tradeMethodNotAllowed;
export const DELETE = tradeMethodNotAllowed;
