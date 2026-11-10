import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const HELP = `포켓몬 교환 모집 검토 · 운영자 Cloudflare 로그인 필요
npm run trades:review -- list [--status pending] [--city seoul]
npm run trades:review -- show POST_ID
npm run trades:review -- approve POST_ID --checked --note "포켓몬·연락방법 공개 동의와 모집 내용을 검토한 근거"
npm run trades:review -- reject POST_ID --note "보류 사유"
npm run trades:review -- remove POST_ID --note "공개 중단 사유"
공통: --database pokedoko-growth [--config /absolute/path/wrangler.json]
로컬: --local --config /absolute/path/wrangler.json [--persist-to /absolute/path/state]
show에는 비공개 접수 연락 방법이 있으므로 출력물을 공개하지 마세요.
관리자 승인도 게임 계정·보유 포켓몬·교환 가능 여부를 인증하지 않습니다.`;
const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) { console.log(HELP); process.exit(0); }
const action = args.shift();
if (!["list", "show", "approve", "reject", "remove"].includes(action)) throw new Error(HELP);
const id = action === "list" ? undefined : args.shift();
if (id !== undefined && !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)) throw new Error("정확한 모집 글 ID를 입력하세요.");
if (action !== "list" && id === undefined) throw new Error("모집 글 ID가 필요합니다.");
const options = { database: "pokedoko-growth", status: "pending" }, flags = new Set(), seen = new Set();
for (let i = 0; i < args.length; i++) {
  const flag = args[i]; if (seen.has(flag)) throw new Error(`중복 옵션: ${flag}`); seen.add(flag);
  if (["--checked", "--local"].includes(flag)) { flags.add(flag); continue; }
  const key = { "--database": "database", "--config": "config", "--persist-to": "persistTo", "--status": "status", "--city": "city", "--note": "note" }[flag];
  if (!key || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`알 수 없거나 값이 빠진 옵션: ${flag}`);
  options[key] = args[++i];
}
if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(options.database)) throw new Error("실제 데이터베이스 이름을 입력하세요.");
if (!["pending", "approved", "closed", "rejected", "removed"].includes(options.status)) throw new Error("status를 확인하세요.");
for (const key of ["config", "persistTo"]) if (options[key] && !path.isAbsolute(options[key])) throw new Error(`${key}에는 절대 경로가 필요합니다.`);
if (flags.has("--local") && !options.config || options.persistTo && !flags.has("--local")) throw new Error("로컬 DB에는 config를 지정하고 persist-to는 로컬에만 사용하세요.");
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`;
const { CITIES } = await import(moduleUrl(await readFile(path.join(root, "lib/cities.ts"), "utf8")));
const names = JSON.parse(await readFile(path.join(root, "lib/pokemon-names.json"), "utf8"));
const source = (await readFile(path.join(root, "lib/trades.ts"), "utf8")).replace('import { CITIES } from "./cities";', `const CITIES = ${JSON.stringify(CITIES)};`).replace('import POKEMON_NAMES from "./pokemon-names.json";', `const POKEMON_NAMES = ${JSON.stringify(names)};`);
const { validateTradeSubmission } = await import(moduleUrl(source));
if (options.city && !CITIES.some(city => city.id === options.city)) throw new Error("city를 확인하세요.");
const literal = value => `'${String(value).replace(/'/g, "''")}'`;
function query(sql) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", options.database,
    flags.has("--local") ? "--local" : "--remote", ...(options.config ? ["--config", options.config] : []), ...(options.persistTo ? ["--persist-to", options.persistTo] : []), "--command", sql, "--json"],
  { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.stderr.write(result.stderr || "D1 요청 실패. Wrangler 로그인을 확인하세요.\n"); process.exit(result.status || 1); }
  const data = JSON.parse(result.stdout);
  if (!Array.isArray(data) || data.some(value => value.success === false)) throw new Error("D1 요청이 실패했습니다.");
  return data.flatMap(value => Array.isArray(value.results) ? value.results : []);
}
if (action === "list") {
  const rows = query(`SELECT id,trainer_name,city_id,mode,offer_species_id,want_species_id,status,datetime(expires_at,'unixepoch','+9 hours') AS expires_kst FROM trade_posts WHERE status=${literal(options.status)}${options.city ? ` AND city_id=${literal(options.city)}` : ""} ORDER BY created_at DESC,id DESC LIMIT 50`);
  console.log(`포켓몬 교환 모집 · ${options.status} · 최대50개`);
  if (rows.length) console.table(rows); else console.log("해당하는 모집 글이 없습니다."); process.exit(0);
}
const row = query(`SELECT id,trainer_name,city_id,mode,offer_species_id,offer_shiny,offer_form,want_species_id,want_shiny,want_form,contact_kind,contact_value,contact_public_consent,notes,status,created_at,expires_at,review_note,reviewed_at,published_at FROM trade_posts WHERE id=${literal(id)}`)[0];
if (!row) throw new Error("모집 글을 찾지 못했습니다.");
if (action === "show") { console.log(JSON.stringify(row, null, 2)); process.exit(0); }
if (typeof options.note !== "string" || options.note.trim().length < 10 || options.note.length > 1000 || /[\u0000-\u001f\u007f]/u.test(options.note)) throw new Error("검토 근거·처리 사유를 --note로 10~1,000자 입력하세요.");
if (action === "approve") {
  if (!flags.has("--checked") || row.status !== "pending" || row.expires_at <= Math.floor(Date.now() / 1000)) throw new Error("만료 전 대기 글의 내용을 검토하고 --checked를 지정하세요.");
  if (![0, 1].includes(row.offer_shiny) || ![0, 1].includes(row.want_shiny)) throw new Error("저장된 색이 다른 모습 여부를 확인할 수 없습니다.");
  const validated = validateTradeSubmission({ visitorId: "550e8400-e29b-41d4-a716-446655440000", ownerKey: "0".repeat(64), trainerName: row.trainer_name, cityId: row.city_id, mode: row.mode,
    offer: { speciesId: row.offer_species_id, shiny: row.offer_shiny === 1, form: row.offer_form }, want: { speciesId: row.want_species_id, shiny: row.want_shiny === 1, form: row.want_form },
    contactKind: row.contact_kind, contactValue: row.contact_value, contactPublicConsent: row.contact_public_consent === 1, notes: row.notes, expiresInDays: 7 });
  if (validated.contactValue !== row.contact_value) throw new Error("저장된 연락 방법이 정규 형식과 다릅니다. 원래 제보 내용을 확인해 주세요.");
  const changed = query(`UPDATE trade_posts SET status='approved',review_note=${literal(options.note.trim())},reviewed_at=unixepoch(),published_at=unixepoch() WHERE id=${literal(id)} AND status='pending' AND expires_at>unixepoch() RETURNING id,status`);
  if (changed.length !== 1) throw new Error("상태가 변경되었거나 만료되어 공개하지 않았습니다.");
  console.log(`공개 완료: ${id}`);
} else {
  const status = action === "reject" ? "rejected" : "removed";
  const changed = query(`UPDATE trade_posts SET status=${literal(status)},review_note=${literal(options.note.trim())},reviewed_at=unixepoch() WHERE id=${literal(id)} RETURNING id,status`);
  if (changed.length !== 1) throw new Error("처리 상태를 확인하지 못했습니다.");
  console.log(`처리 완료: ${id} · ${status}`);
}
