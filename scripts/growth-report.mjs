import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("npm run growth:report -- [--days 7] [--database pokedoko-growth]\nRequires your Cloudflare Wrangler login. Reads only daily aggregate counts; never prints feedback messages or visitor hashes.");
  process.exit(0);
}
let days = 7, database = "pokedoko-growth";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--days" && /^\d+$/.test(args[i + 1] ?? "")) days = Number(args[++i]);
  else if (args[i] === "--database" && /^[a-z0-9][a-z0-9-]{2,62}$/.test(args[i + 1] ?? "")) database = args[++i];
  else throw new Error("Use --days 1–90 and an existing database name. No arbitrary SQL is accepted.");
}
if (!Number.isSafeInteger(days) || days < 1 || days > 90) throw new Error("Days must be between 1 and 90.");
const sql = `SELECT day, source, page_views, coordinate_copies, shares, unique_visitors, returning_visitors_7d, returning_rate_7d_percent FROM growth_daily_summary WHERE day >= date('now','+9 hours','-${days - 1} days') ORDER BY day DESC, source`;
const result = spawnSync(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", database, "--remote", "--command", sql, "--json"], { cwd: root, encoding: "utf8", shell: false, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
if (result.error) throw result.error;
if (result.status !== 0) { process.stderr.write(result.stderr || "Cloudflare query failed. Run npx wrangler login with D1 access.\n"); process.exit(result.status || 1); }
let values;
try { values = JSON.parse(result.stdout); } catch { throw new Error("Could not parse the Cloudflare response; no report was generated."); }
const rows = Array.isArray(values) ? values.flatMap(value => Array.isArray(value.results) ? value.results : []) : [];
console.log("pokedoko 이용 현황 · 한국시간 날짜 · 브라우저 기준 근사 집계");
if (rows.length) console.table(rows);
else console.log("선택한 기간에 저장된 이용 집계가 없습니다.");
