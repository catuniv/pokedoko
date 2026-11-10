import { collectHuntingStops, parseHuntingStopQuery } from "../../../../lib/hunting-stops";

export async function GET(request: Request) {
  let query;
  try { query = parseHuntingStopQuery(new URL(request.url)); }
  catch { return Response.json({ status: "error", message: "도시·추천 장소·반경을 확인해 주세요." }, { status: 400, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
  const result = await collectHuntingStops(query);
  // A CDN cache must not extend the source-age limit beyond the helper's cache.
  const remaining = result.fetchedAt ? Math.floor((Date.parse(result.fetchedAt) + 600_000 - Date.now()) / 1000) : 0;
  const maxAge = Math.max(0, Math.min(60, Number.isFinite(remaining) ? remaining : 0));
  return Response.json(result, {
    status: result.status === "error" ? 502 : 200,
    headers: { "Cache-Control": result.status === "error" ? "no-store" : `public, max-age=${maxAge}`, "X-Robots-Tag": "noindex, nofollow" },
  });
}
