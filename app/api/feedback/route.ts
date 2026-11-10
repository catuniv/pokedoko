import { env } from "cloudflare:workers";
import { growthMethodNotAllowed, handleFeedbackRequest } from "../../../lib/growth-server";

export async function POST(request: Request) { return handleFeedbackRequest(request, env.DB); }
export const GET = growthMethodNotAllowed;
export const HEAD = growthMethodNotAllowed;
export const OPTIONS = growthMethodNotAllowed;
export const PUT = growthMethodNotAllowed;
export const PATCH = growthMethodNotAllowed;
export const DELETE = growthMethodNotAllowed;
