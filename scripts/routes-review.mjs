import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const HELP = `지가르데 셀 루트 제보 검토 · 운영자 Cloudflare 로그인 필요

npm run routes:review -- list [--status pending] [--city seoul]
npm run routes:review -- show ROUTE_ID
npm run routes:review -- export ROUTE_ID --output /absolute/path/route.json
npm run routes:review -- approve ROUTE_ID --rights-checked --game-route-checked --note "출처·제작자 허락과 게임 경로를 확인한 근거"
npm run routes:review -- reject ROUTE_ID --note "보류 사유"
npm run routes:review -- remove ROUTE_ID --note "공개 중단 사유"

공통: --database pokedoko-growth [--config /absolute/path/wrangler.json]
로컬 테스트 DB: --local --config /absolute/path/wrangler.json [--persist-to /absolute/path/state]
list/show/export는 비공개 접수 자료를 운영자에게만 보여 줍니다.
approve는 공개 게시이며 원본 경로의 정체성과 재배포 허락을 직접 검토한 후 사용하세요.
export는 검토용 JSON이며 공개 GPX가 아닙니다. 접수 자료를 GitHub에 올리지 마세요.`;
const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) { console.log(HELP); process.exit(0); }
const action = args.shift();
if (!["list", "show", "export", "approve", "reject", "remove"].includes(action)) throw new Error(HELP);
let id;
if (action !== "list") {
  id = args.shift();
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id ?? "")) throw new Error("정확한 접수 ID를 입력하세요.");
}
const options = { database: "pokedoko-growth", status: "pending" };
const flags = new Set();
const seen = new Set();
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (seen.has(flag)) throw new Error(`중복 옵션: ${flag}`);
  seen.add(flag);
  if (["--rights-checked", "--game-route-checked", "--local"].includes(flag)) { flags.add(flag); continue; }
  const key = { "--database": "database", "--status": "status", "--city": "city", "--note": "note", "--output": "output", "--config": "config", "--persist-to": "persistTo" }[flag];
  if (!key || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`알 수 없거나 값이 빠진 옵션: ${flag}`);
  options[key] = args[++i];
}
if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(options.database)) throw new Error("실제 D1 데이터베이스 이름을 입력하세요.");
if (!["pending", "approved", "rejected", "removed"].includes(options.status)) throw new Error("status를 확인하세요.");
if (options.config && !path.isAbsolute(options.config) || options.output && !path.isAbsolute(options.output) || options.persistTo && !path.isAbsolute(options.persistTo)) throw new Error("config/output/persist-to에는 절대 경로를 입력하세요.");
if (flags.has("--local") && !options.config) throw new Error("로컬 DB에는 --config가 필요합니다.");
if (options.persistTo && !flags.has("--local")) throw new Error("persist-to는 로컬 테스트 DB에만 지정할 수 있습니다.");
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`;
const { CITIES } = await import(moduleUrl(await readFile(path.join(root, "lib/cities.ts"), "utf8")));
const commonSource = (await readFile(path.join(root, "lib/community-routes.ts"), "utf8")).replace('import { CITIES } from "./cities";', `const CITIES = ${JSON.stringify(CITIES)};`);
const { validateCommunityGeometry, validateCommunitySubmission } = await import(moduleUrl(commonSource));
if (options.city && !CITIES.some(city => city.id === options.city)) throw new Error("city를 확인하세요.");
const literal = value => `'${String(value).replace(/'/g, "''")}'`;
function query(sql) {
  const command = [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", options.database,
    flags.has("--local") ? "--local" : "--remote", ...(options.config ? ["--config", options.config] : []), ...(options.persistTo ? ["--persist-to", options.persistTo] : []), "--command", sql, "--json"];
  const result = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.stderr.write(result.stderr || "D1 조회에 실패했습니다. Wrangler 로그인을 확인하세요.\n"); process.exit(result.status || 1); }
  let response;
  try { response = JSON.parse(result.stdout); } catch { throw new Error("D1 응답을 읽지 못했습니다."); }
  if (!Array.isArray(response) || response.some(value => value.success === false)) throw new Error("D1 요청이 실패했습니다.");
  return response.flatMap(value => Array.isArray(value.results) ? value.results : []);
}
const columns = "id,status,name,city_id,start_name,end_name,start_lat,start_lon,end_lat,end_lon,reported_distance_m,computed_distance_m,geometry_type,geometry_validation,points_json,point_count,source_url,creator_name,rights_basis,rights_details,permission_confirmed,in_game_confirmed,last_checked_at,notes,review_note,reviewed_at,published_at,created_at";
if (action === "list") {
  const rows = query(`SELECT id,name,city_id,geometry_type,point_count,last_checked_at,datetime(created_at,'unixepoch','+9 hours') AS received_kst FROM community_routes WHERE status=${literal(options.status)}${options.city ? ` AND city_id=${literal(options.city)}` : ""} ORDER BY created_at DESC,id DESC LIMIT 50`);
  console.log(`지가르데 셀 루트 제보 · ${options.status} · 최대50개`);
  if (rows.length) console.table(rows); else console.log("해당하는 제보가 없습니다.");
  process.exit(0);
}
const row = query(`SELECT ${columns} FROM community_routes WHERE id=${literal(id)} LIMIT 1`)[0];
if (!row) throw new Error("해당 제보를 찾지 못했습니다.");
function requireReviewNote() {
  if (typeof options.note !== "string" || options.note.trim().length < 10 || options.note.length > 1000 || /[\u0000-\u001f\u007f]/u.test(options.note)) throw new Error("검토 근거 또는 처리 사유를 --note로 10~1,000자 입력하세요.");
  return options.note.trim();
}
// Corrupted geometry must never prevent an operator from hiding a record.
if (action === "reject" || action === "remove") {
  const note = requireReviewNote(), status = action === "reject" ? "rejected" : "removed";
  const updated = query(`UPDATE community_routes SET status=${literal(status)},review_note=${literal(note)},reviewed_at=unixepoch() WHERE id=${literal(id)} RETURNING id,status`);
  if (updated.length !== 1) throw new Error("처리 상태를 확인하지 못했습니다.");
  console.log(`처리 완료: ${id} · ${status}`); process.exit(0);
}
const points = row.points_json ? JSON.parse(row.points_json) : undefined;
const publicRecord = { ...row, points }; delete publicRecord.points_json;
if (action === "show") {
  const preview = points ? { pointCount: points.length, first: points[0], last: points.at(-1) } : null;
  console.log(JSON.stringify({ ...publicRecord, points: preview }, null, 2)); process.exit(0);
}
if (action === "export") {
  if (!options.output) throw new Error("검토용 JSON의 --output 절대 경로가 필요합니다.");
  await writeFile(options.output, `${JSON.stringify({ ...publicRecord, privateReviewOnly: true }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(`비공개 검토용 JSON 저장: ${options.output}`); process.exit(0);
}
requireReviewNote();
if (action === "approve") {
  if (row.status !== "pending") throw new Error("검토 대기 중인 제보만 승인할 수 있습니다.");
  if (!flags.has("--rights-checked") || !flags.has("--game-route-checked")) throw new Error("제작자·이용 허락과 실제 게임 Route를 확인하고 --rights-checked --game-route-checked를 모두 지정하세요.");
  validateCommunitySubmission({ visitorId: "550e8400-e29b-41d4-a716-446655440000", name: row.name, cityId: row.city_id,
    startName: row.start_name, endName: row.end_name, startPoint: { lat: row.start_lat, lon: row.start_lon },
    ...(row.end_lat !== null && row.end_lon !== null ? { endPoint: { lat: row.end_lat, lon: row.end_lon } } : {}),
    reportedDistanceMeters: row.reported_distance_m, sourceUrl: row.source_url, creatorName: row.creator_name,
    rightsBasis: row.rights_basis, rightsDetails: row.rights_details, allowRedistribution: row.permission_confirmed === 1,
    inGameConfirmed: row.in_game_confirmed === 1, lastCheckedAt: row.last_checked_at, geometryType: row.geometry_type, points, notes: row.notes });
  if (points) validateCommunityGeometry(points, row.reported_distance_m, { lat: row.start_lat, lon: row.start_lon }, row.end_lat !== null ? { lat: row.end_lat, lon: row.end_lon } : undefined);
  const updated = query(`UPDATE community_routes SET status='approved',rights_reviewed=1,route_reviewed=1,review_note=${literal(options.note.trim())},reviewed_at=unixepoch(),published_at=unixepoch() WHERE id=${literal(id)} AND status='pending' RETURNING id,status`);
  if (updated.length !== 1) throw new Error("검토 상태가 변경되어 공개하지 않았습니다.");
  console.log(`공개 완료: ${id} · ${row.geometry_type === "none" ? "GPX 없음" : row.geometry_type}`);
}
