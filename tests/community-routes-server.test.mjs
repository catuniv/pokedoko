import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const citiesUrl = moduleUrl(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const cellRoutesUrl = moduleUrl(await readFile(new URL('../lib/cell-routes.ts', import.meta.url), 'utf8'));
const common = (await readFile(new URL('../lib/community-routes.ts', import.meta.url), 'utf8'))
  .replace(/from (["'])\.\/cities\1/g, `from '${citiesUrl}'`)
  .replace(/from (["'])\.\/cell-routes\1/g, `from '${cellRoutesUrl}'`);
const commonUrl = moduleUrl(common);
const server = (await readFile(new URL('../lib/community-routes-server.ts', import.meta.url), 'utf8'))
  .replace(/from (["'])\.\/community-routes\1/g, `from '${commonUrl}'`)
  .replace(/from (["'])\.\/cities\1/g, `from '${citiesUrl}'`);
const { handleCommunityRoutesGet, handleCommunityRouteGet, handleCommunityRouteGpx, handleCommunityRouteSubmission } = await import(moduleUrl(server));
const migrationFiles = (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
const migrations = await Promise.all(migrationFiles.map(name => readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')));

const FIXED = Date.parse('2026-11-10T03:00:00Z');
const ORIGIN = 'https://pokedoko.example';
const VISITOR = '550e8400-e29b-41d4-a716-446655440000';
const A = { lat: 37.5665, lon: 126.978 };
const points = () => [A, { lat: 37.5675, lon: 126.978 }, { lat: 37.5675, lon: 126.98 }, { lat: 37.5665, lon: 126.98 }, A].map(value => ({ ...value }));
const submission = (patch = {}) => ({
  visitorId: VISITOR, name: '공개 검토 전 테스트 경로', cityId: 'seoul',
  startName: '시청 시작 포켓스톱', endName: '시청 종료 포켓스톱',
  startPoint: { ...A }, endPoint: { ...A }, reportedDistanceMeters: 575,
  creatorName: '직접 기록한 제작자', rightsBasis: 'creator', rightsDetails: '본인이 만든 경로의 공개 재배포에 동의합니다.',
  allowRedistribution: true, inGameConfirmed: true, lastCheckedAt: '2026-11-10',
  geometryType: 'original', points: points(), notes: '검토 중에는 외부에 보이지 않아야 할 설명입니다.',
  ...patch,
});
const post = (payload, headers = {}) => new Request(`${ORIGIN}/api/community-routes`, {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
});
const listRequest = (query = 'city=seoul') => new Request(`${ORIGIN}/api/community-routes?${query}`);
const at = value => () => new Date(value);

/** Actual migrations and SQL run in SQLite; the wrapper only translates D1's result envelope. */
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations) sql.exec(migration);
  const calls = [];
  return { sql, calls,
    prepare(query) {
      const make = values => ({
        bind(...next) { return make(next); },
        async first(column) {
          calls.push({ query, values });
          const row = sql.prepare(query).get(...values);
          return column ? row?.[column] ?? null : row ?? null;
        },
        async all() {
          calls.push({ query, values });
          return { success: true, results: sql.prepare(query).all(...values), meta: {} };
        },
        async run() {
          calls.push({ query, values });
          const result = sql.prepare(query).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      });
      return make([]);
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (cause) { sql.exec('ROLLBACK'); throw cause; }
    },
  };
}
const rows = db => db.sql.prepare('SELECT * FROM community_routes ORDER BY rowid').all().map(value => ({ ...value }));
const approve = (db, id, status = 'approved') => status === 'approved'
  ? db.sql.prepare("UPDATE community_routes SET status = 'approved', rights_reviewed = 1, route_reviewed = 1, review_note = '제작자 공개 허락과 게임 루트 정체성을 확인했습니다.', reviewed_at = ?, published_at = ? WHERE id = ?").run(Math.floor(FIXED / 1000), Math.floor(FIXED / 1000), id)
  : db.sql.prepare('UPDATE community_routes SET status = ? WHERE id = ?').run(status, id);
async function submit(db, patch = {}, timestamp = FIXED) {
  const response = await handleCommunityRouteSubmission(post(submission(patch)), db, at(timestamp));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  return rows(db).at(-1).id;
}

test('a valid submission is durable but remains private until an operator publishes it', async () => {
  const db = database();
  const id = await submit(db);
  assert.equal(rows(db).length, 1);
  assert.equal(rows(db)[0].status, 'pending');
  assert.ok(!JSON.stringify(db.calls).includes(VISITOR), 'raw browser identity must never enter SQL bindings');
  assert.ok(!JSON.stringify(rows(db)).includes(VISITOR));
  const list = await handleCommunityRoutesGet(listRequest(), db);
  assert.equal(list.status, 200);
  const text = await list.text();
  assert.equal(text.includes(submission().name), false);
  assert.equal(text.includes(submission().notes), false);
  assert.equal((await handleCommunityRouteGet(id, db)).status, 404);
  assert.equal((await handleCommunityRouteGpx(id, db)).status, 404);
});

test('only approved routes appear publicly, with geometry reserved for the detail response', async () => {
  const db = database();
  const id = await submit(db);
  approve(db, id);
  const response = await handleCommunityRoutesGet(listRequest(), db);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.routes.length, 1);
  const listed = body.routes[0];
  assert.equal(listed.id, id);
  assert.equal(listed.gpxAvailable, true);
  assert.equal(Object.hasOwn(listed, 'points'), false);
  for (const key of ['visitorId', 'visitor_hash', 'visitorHash', 'hour_bucket']) assert.equal(Object.hasOwn(listed, key), false);
  const detailResponse = await handleCommunityRouteGet(id, db);
  assert.equal(detailResponse.status, 200);
  const detail = (await detailResponse.json()).route;
  assert.deepEqual(detail.points, points());
  assert.equal(detail.sourceUrl, undefined);
  assert.equal(JSON.stringify(detail).includes(VISITOR), false);
  const otherCity = await handleCommunityRoutesGet(listRequest('city=tokyo'), db);
  assert.equal((await otherCity.json()).routes.length, 0);
  for (const status of ['rejected', 'removed']) {
    approve(db, id, status);
    assert.equal((await handleCommunityRouteGet(id, db)).status, 404);
    assert.equal((await handleCommunityRouteGpx(id, db)).status, 404);
    assert.equal((await (await handleCommunityRoutesGet(listRequest(), db)).json()).routes.length, 0);
  }
});

test('approved GPX downloads include every point in order and attribution, with no browser identity', async () => {
  const db = database();
  const id = await submit(db, { name: '서울 & 경로', sourceUrl: 'https://example.com/source?a=1&b=2' });
  approve(db, id);
  const response = await handleCommunityRouteGpx(id, db);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/gpx\+xml/);
  assert.match(response.headers.get('Content-Disposition'), /attachment/);
  const xml = await response.text();
  const exported = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map(match => ({ lat: Number(match[1]), lon: Number(match[2]) }));
  assert.deepEqual(exported, points());
  assert.equal((xml.match(/<trk>/g) ?? []).length, 1);
  assert.ok(xml.includes('서울 &amp; 경로'));
  assert.ok(xml.includes('a=1&amp;b=2'));
  assert.ok(xml.includes('직접 기록한 제작자'));
  assert.equal(xml.includes(VISITOR), false);
  assert.equal(xml.includes('<time>'), false);
});

test('approved metadata-only routes remain visible without a GPX endpoint', async () => {
  const db = database();
  const id = await submit(db, { geometryType: 'none', points: undefined, endPoint: undefined, endName: '' });
  approve(db, id);
  const detail = (await (await handleCommunityRouteGet(id, db)).json()).route;
  assert.equal(detail.geometryType, 'none');
  assert.equal(detail.gpxAvailable, false);
  assert.ok(!detail.points || detail.points.length === 0);
  assert.equal((await handleCommunityRouteGpx(id, db)).status, 404);
});

test('publication requires recorded rights and game-route review, and stored geometry is revalidated', async () => {
  const db = database();
  const id = await submit(db);
  assert.throws(() => db.sql.prepare("UPDATE community_routes SET status = 'approved' WHERE id = ?").run(id), /publication_check/);
  assert.throws(() => db.sql.prepare("UPDATE community_routes SET status = 'approved', rights_reviewed = 1, reviewed_at = ?, published_at = ?, review_note = '권리만 확인' WHERE id = ?").run(Math.floor(FIXED / 1000), Math.floor(FIXED / 1000), id), /publication_check/);
  approve(db, id);
  db.sql.prepare('UPDATE community_routes SET points_json = ? WHERE id = ?').run(JSON.stringify([A, { lat: 35.68, lon: 139.8 }]), id);
  const detail = await handleCommunityRouteGet(id, db);
  const download = await handleCommunityRouteGpx(id, db);
  assert.equal(detail.status, 503);
  assert.equal(download.status, 503);
  assert.equal((await download.text()).includes('<gpx'), false);
});

test('route submission requires consent, bounded geometry and a real date before writing SQL', async () => {
  const db = database();
  for (const patch of [
    { allowRedistribution: false }, { inGameConfirmed: false }, { geometryType: 'none' },
    { points: [A] }, { points: [A, { lat: 35.68, lon: 139.8 }] },
    { reportedDistanceMeters: 300 }, { lastCheckedAt: '2026-02-30' },
    { rightsBasis: 'permission', rightsDetails: '공개 자료', sourceUrl: undefined },
    { sourceUrl: 'https://user:password@example.com/path' },
    { visitorId: 'invalid' }, { cityId: 'unknown' }, { unexpectedDiagnostic: 'not allowed' },
  ]) {
    const response = await handleCommunityRouteSubmission(post(submission(patch)), db, at(FIXED));
    assert.equal(response.status, 400);
  }
  assert.equal(rows(db).length, 0);
  assert.equal(db.calls.length, 0);
});

test('a submitter can retry its pending submission without consuming another slot or exposing it to someone else', async () => {
  const db = database();
  const first = await handleCommunityRouteSubmission(post(submission()), db, at(FIXED));
  const receipt = await first.json();
  assert.equal(first.status, 201);
  const retry = await handleCommunityRouteSubmission(post(submission()), db, at(FIXED + 1000));
  const repeated = await retry.json();
  assert.equal(retry.status, 201);
  assert.equal(repeated.id, receipt.id);
  assert.equal(repeated.duplicate, true);
  assert.equal(rows(db).length, 1);
  const other = await handleCommunityRouteSubmission(post(submission({ visitorId: '550e8400-e29b-41d4-a716-446655440001' })), db, at(FIXED));
  assert.equal(other.status, 429);
  const denied = await other.json();
  assert.equal(Object.hasOwn(denied, 'id'), false);
  assert.equal(JSON.stringify(denied).includes(receipt.id), false);
  assert.equal(rows(db).length, 1);
});

test('public pagination is bounded and its count excludes pending records', async () => {
  const db = database();
  for (let index = 0; index < 21; index++) {
    const id = await submit(db, { visitorId: crypto.randomUUID(), name: `공개 경로 ${index}` });
    approve(db, id);
  }
  await submit(db, { visitorId: crypto.randomUUID(), name: '아직 검토 중인 경로' });
  const first = await (await handleCommunityRoutesGet(listRequest('city=seoul&page=1'), db)).json();
  assert.equal(first.routes.length, 20);
  assert.equal(first.total, 21);
  assert.equal(first.hasMore, true);
  const second = await (await handleCommunityRoutesGet(listRequest('city=seoul&page=2'), db)).json();
  assert.equal(second.routes.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.routes, ...second.routes].map(route => route.id)).size, 21);
  for (const query of ['city=unknown', 'city=seoul&page=0', 'city=seoul&page=101', 'city=seoul&page=1 OR 1=1']) {
    assert.equal((await handleCommunityRoutesGet(listRequest(query), db)).status, 400);
  }
});

test('submission rejects cross-origin requests, invalid JSON and actual oversized streamed bodies', async () => {
  const db = database();
  const cases = [
    [post(submission(), { Origin: 'https://other.example' }), 403],
    [post(submission(), { Origin: '' }), 403],
    [post(submission(), { 'Sec-Fetch-Site': 'cross-site' }), 403],
    [post(submission(), { 'Content-Type': 'text/plain' }), 415],
    [post(submission(), { 'Content-Length': String(192 * 1024 + 1) }), 413],
    [post({ ...submission(), notes: 'x'.repeat(192 * 1024) }, { 'Content-Length': '1' }), 413],
    [new Request(`${ORIGIN}/api/community-routes`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{bad' }), 400],
  ];
  for (const [request, expected] of cases) assert.equal((await handleCommunityRouteSubmission(request, db, at(FIXED))).status, expected);
  assert.equal(db.calls.length, 0);
});

test('honeypot submissions do not reach storage and missing/broken storage reports failure honestly', async () => {
  const db = database();
  const ignored = await handleCommunityRouteSubmission(post(submission({ website: 'spam.example' })), db, at(FIXED));
  assert.equal(ignored.status, 202);
  assert.equal(db.calls.length, 0);
  assert.equal((await handleCommunityRouteSubmission(post(submission()), undefined, at(FIXED))).status, 503);
  assert.equal((await handleCommunityRoutesGet(listRequest())).status, 503);
  const broken = { prepare() { throw new Error('private database diagnostic'); } };
  const response = await handleCommunityRouteSubmission(post(submission()), broken, at(FIXED));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private database diagnostic'), false);
  const list = await handleCommunityRoutesGet(listRequest(), broken);
  assert.equal(list.status, 503);
});

test('real SQL rate admission limits a visitor to three submissions per hour', async () => {
  const db = database();
  for (let index = 0; index < 3; index++) await submit(db, { name: `유효한 제보 ${index}` });
  const capped = await handleCommunityRouteSubmission(post(submission({ name: '네 번째 제보' })), db, at(FIXED));
  assert.equal(capped.status, 429);
  assert.ok(Number(capped.headers.get('Retry-After')) > 0);
  assert.equal(rows(db).length, 3);
  await submit(db, { name: '다음 시간의 제보' }, FIXED + 3600000);
  assert.equal(rows(db).length, 4);
});

test('global daily admission is enforced by the actual migration rather than only client controls', async () => {
  const db = database();
  await submit(db);
  const original = rows(db)[0], columns = Object.keys(original);
  const insert = db.sql.prepare(`INSERT INTO community_routes (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (let index = 1; index < 1000; index++) {
    const row = { ...original, id: crypto.randomUUID(), visitor_hash: index.toString(16).padStart(64, '0'), fingerprint: index.toString(16).padStart(64, '0'), name: `별도 제작자의 경로 ${index}`,
      status: 'approved', rights_reviewed: 1, route_reviewed: 1, review_note: '제작자와 전체 경로를 검토한 자료', reviewed_at: Math.floor(FIXED / 1000), published_at: Math.floor(FIXED / 1000) };
    const inserted = insert.run(...columns.map(column => row[column]));
    assert.equal(Number(inserted.changes), 1);
  }
  assert.equal(rows(db).length, 1000);
  const capped = await handleCommunityRouteSubmission(post(submission({ visitorId: '550e8400-e29b-41d4-a716-446655440001', name: '전역 한도 이후의 새로운 경로' })), db, at(FIXED));
  assert.equal(capped.status, 429);
  assert.equal(rows(db).length, 1000);
});

test('the pending moderation backlog stops at five hundred without exposing another submission', async () => {
  const db = database();
  await submit(db);
  const original = rows(db)[0], columns = Object.keys(original);
  const insert = db.sql.prepare(`INSERT INTO community_routes (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (let index = 1; index < 500; index++) {
    const row = { ...original, id: crypto.randomUUID(), visitor_hash: index.toString(16).padStart(64, '0'), fingerprint: index.toString(16).padStart(64, '0'), name: `검토 대기 경로 ${index}` };
    assert.equal(Number(insert.run(...columns.map(column => row[column])).changes), 1);
  }
  const capped = await handleCommunityRouteSubmission(post(submission({ visitorId: '550e8400-e29b-41d4-a716-446655440001', name: '검토 대기 한도를 넘는 별도 자료' })), db, at(FIXED));
  assert.equal(capped.status, 429);
  const body = await capped.json();
  assert.equal(Object.hasOwn(body, 'id'), false);
  assert.equal(rows(db).length, 500);
});
