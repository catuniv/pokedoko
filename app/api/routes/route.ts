import { env } from "cloudflare:workers";
import { communityRouteMethodNotAllowed, handleCommunityRouteSubmission, handleCommunityRoutesGet } from "../../../lib/community-routes-server";
export async function GET(request: Request) { return handleCommunityRoutesGet(request, env.DB); }
export async function POST(request: Request) { return handleCommunityRouteSubmission(request, env.DB); }
export const PUT = communityRouteMethodNotAllowed;
export const PATCH = communityRouteMethodNotAllowed;
export const DELETE = communityRouteMethodNotAllowed;
