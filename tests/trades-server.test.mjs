import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText + '\n//# sourceURL=trade-server-test-runtime.js').toString('base64')}`;
const citiesUrl = moduleUrl(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const names = JSON.parse(await readFile(new URL('../lib/pokemon-names.json', import.meta.url), 'utf8'));
const commonSource = (await readFile(new URL('../lib/trades.ts', import.meta.url), 'utf8'))
  .replace(/from (["'])\.\/cities\1/g, `from '${citiesUrl}'`)
  .replace('import POKEMON_NAMES from "./pokemon-names.json";', `const POKEMON_NAMES = ${JSON.stringify(names)};`);
const commonUrl = moduleUrl(commonSource);
const source = (await readFile(new URL('../lib/trades-server.ts', import.meta.url), 'utf8'))
  .replace(/from (["'])\.\/cities\1/g, `from '${citiesUrl}'`)
  .replace(/from (["'])\.\/trades\1/g, `from '${commonUrl}'`);
const { handleTradesGet, handleTradeGet, handleTradeSubmission, handleTradeManage, handleTradeRecovery } = await import(moduleUrl(source));
const migrationFiles = (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
const migrations = await Promise.all(migrationFiles.map(name => readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')));
const FIXED = Date.parse('2026-11-10T03:00:00Z');
const ORIGIN = 'https://pokedoko.example';
const VISITOR = '550e8400-e29b-41d4-a716-446655440000';
const OWNER = '0123456789abcdef'.repeat(4);
const ownerKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const at = milliseconds => () => new Date(milliseconds);
const body = patch => ({
  visitorId: VISITOR, ownerKey: OWNER, trainerName: '테스트 트레이너', cityId: 'seoul', mode: 'local',
  offer: { speciesId: 25, shiny: false, form: '' }, want: { speciesId: 1, shiny: true, form: '' },
  contactKind: 'friend_code', contactValue: '1234 5678 9012', contactPublicConsent: true,
  notes: '교환 가능 여부와 시간은 게임에서 먼저 확인합니다.', expiresInDays: 3, ...patch,
});
const request = (value, path = '/api/trades', headers = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
});
const listRequest = (query = '') => new Request(`${ORIGIN}/api/trades${query ? `?${query}` : ''}`);
const manageRequest = (key, action, patch = {}) => request({ ownerKey: key, action, ...patch }, '/api/trades/manage');

/** The real SQL and migrations execute in SQLite behind D1-compatible result envelopes. */
function database(migrationCount = migrations.length) {
  const sql = new DatabaseSync(':memory:');
  for (const migration of migrations.slice(0, migrationCount)) sql.exec(migration);
  const calls = [];
  return { sql, calls,
    prepare(query) {
      const statement = values => ({
        bind(...next) { return statement(next); },
        async first(column) {
          calls.push({ query, values });
          const row = sql.prepare(query).get(...values);
          return column ? row?.[column] ?? null : row ?? null;
        },
        async all() { calls.push({ query, values }); return { success: true, results: sql.prepare(query).all(...values), meta: {} }; },
        async run() { calls.push({ query, values }); const result = sql.prepare(query).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      });
      return statement([]);
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; }
      catch (cause) { sql.exec('ROLLBACK'); throw cause; }
    },
  };
}
const rows = (db, table = 'trade_posts') => db.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
const approve = (db, id, status = 'approved') => status === 'approved'
  ? db.sql.prepare("UPDATE trade_posts SET status = 'approved', review_note = '연락처 공개 동의와 모집 내용을 검토했습니다.', reviewed_at = ?, published_at = ? WHERE id = ?").run(Math.floor(FIXED / 1000), Math.floor(FIXED / 1000), id)
  : db.sql.prepare('UPDATE trade_posts SET status = ? WHERE id = ?').run(status, id);
async function submit(db, patch = {}, timestamp = FIXED) {
  const input = body({ ownerKey: ownerKey(), ...patch });
  const response = await handleTradeSubmission(request(input), db, at(timestamp));
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.ok, true);
  return { id: receipt.id, input, receipt };
}

test('a trade submission stays private and stores only hashes of its management key and browser identifier', async () => {
  const db = database(), input = body();
  const response = await handleTradeSubmission(request(input), db, at(FIXED));
  assert.equal(response.status, 201);
  const receipt = await response.json(), stored = rows(db)[0];
  assert.equal(receipt.status, 'pending'); assert.equal(stored.status, 'pending');
  assert.match(stored.owner_key_hash, /^[a-f0-9]{64}$/); assert.notEqual(stored.owner_key_hash, OWNER);
  assert.match(stored.visitor_hash, /^[a-f0-9]{64}$/);
  for (const text of [JSON.stringify(stored), JSON.stringify(db.calls), JSON.stringify(receipt)]) {
    assert.equal(text.includes(OWNER), false); assert.equal(text.includes(VISITOR), false);
  }
  assert.equal((await (await handleTradesGet(listRequest(), db, at(FIXED))).json()).posts.length, 0);
  const publicDetail = await handleTradeGet(receipt.id, db, at(FIXED));
  assert.equal(publicDetail.status, 404); assert.equal((await publicDetail.text()).includes('123456789012'), false);
  const owned = await handleTradeManage(receipt.id, manageRequest(OWNER.toUpperCase(), 'status'), db, at(FIXED));
  assert.equal(owned.status, 200);
  const ownedBody = await owned.json();
  assert.equal(ownedBody.post.status, 'pending'); assert.equal(ownedBody.post.contactValue, '123456789012');
  assert.equal(JSON.stringify(ownedBody).includes(OWNER), false);
});

test('reviewed public summaries omit contact and management fields while detail provides the consented contact', async () => {
  const db = database(), local = await submit(db);
  assert.throws(() => db.sql.prepare("UPDATE trade_posts SET status = 'approved' WHERE id = ?").run(local.id), /trade_publication_check/);
  approve(db, local.id);
  const listing = await handleTradesGet(listRequest(), db, at(FIXED));
  assert.equal(listing.status, 200);
  const list = await listing.json();
  assert.equal(list.posts.length, 1); assert.equal(list.posts[0].id, local.id);
  for (const field of ['contactKind', 'contactValue', 'ownerKey', 'owner_key_hash', 'visitor_hash', 'visitorId']) assert.equal(Object.hasOwn(list.posts[0], field), false);
  assert.equal(JSON.stringify(list).includes('123456789012'), false);
  const response = await handleTradeGet(local.id, db, at(FIXED));
  assert.equal(response.status, 200); assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  const detail = (await response.json()).post;
  assert.equal(detail.contactKind, 'friend_code'); assert.equal(detail.contactValue, '123456789012');
  assert.equal(JSON.stringify(detail).includes(local.input.ownerKey), false);
  for (const status of ['closed', 'removed', 'rejected', 'pending']) {
    approve(db, local.id, status);
    assert.equal((await handleTradeGet(local.id, db, at(FIXED))).status, 404);
    assert.equal((await (await handleTradesGet(listRequest(), db, at(FIXED))).json()).total, 0);
  }
});

test('trade filters combine city, mode and offered-or-wanted species without exposing pending entries', async () => {
  const db = database(), local = await submit(db), remote = await submit(db, { cityId: 'tokyo', mode: 'remote', offer: { speciesId: 4, shiny: true, form: '' }, want: { speciesId: 7, shiny: false, form: '' } });
  approve(db, local.id); approve(db, remote.id);
  await submit(db, { trainerName: '검토 전 트레이너' });
  const query = async value => (await (await handleTradesGet(listRequest(value), db, at(FIXED))).json()).posts;
  assert.deepEqual((await query('city=seoul')).map(post => post.id), [local.id]);
  assert.deepEqual((await query('mode=remote')).map(post => post.id), [remote.id]);
  assert.deepEqual((await query('speciesId=1')).map(post => post.id), [local.id]);
  assert.deepEqual((await query('city=tokyo&mode=remote&speciesId=4')).map(post => post.id), [remote.id]);
  assert.equal((await query('city=seoul&mode=remote')).length, 0);
  for (const invalid of ['city=unknown', 'mode=online', 'page=0', 'page=501', 'speciesId=0', 'speciesId=2001', 'speciesId=25 OR 1=1']) {
    assert.equal((await handleTradesGet(listRequest(invalid), db, at(FIXED))).status, 400);
  }
});

test('expiry applies immediately at the exact boundary for every allowed duration and owner status', async () => {
  for (const days of [1, 3, 7]) {
    const db = database(), submitted = await submit(db, { expiresInDays: days });
    approve(db, submitted.id);
    const expiry = FIXED + days * 86400000;
    assert.equal(submitted.receipt.expiresAt, new Date(expiry).toISOString());
    assert.equal((await handleTradeGet(submitted.id, db, at(expiry - 1))).status, 200);
    assert.equal((await handleTradeGet(submitted.id, db, at(expiry))).status, 404);
    assert.equal((await (await handleTradesGet(listRequest(), db, at(expiry))).json()).total, 0);
    const owner = await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'status'), db, at(expiry));
    assert.equal(owner.status, 200); assert.equal((await owner.json()).post.status, 'expired');
    assert.equal(rows(db)[0].status, 'approved', 'expiry must hide the record without requiring a cleanup write');
  }
});

test('only the management key owner can close or delete a post and closure remains hidden', async () => {
  const db = database(), submitted = await submit(db); approve(db, submitted.id);
  const stranger = ownerKey();
  for (const action of ['status', 'close', 'delete']) assert.equal((await handleTradeManage(submitted.id, manageRequest(stranger, action), db, at(FIXED))).status, 404);
  assert.equal(rows(db)[0].status, 'approved');
  const closed = await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'close'), db, at(FIXED));
  assert.equal(closed.status, 200); assert.equal((await closed.json()).post.status, 'closed');
  assert.equal((await handleTradeGet(submitted.id, db, at(FIXED))).status, 404);
  assert.equal((await (await handleTradesGet(listRequest(), db, at(FIXED))).json()).total, 0);
  const repeated = await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'close'), db, at(FIXED));
  assert.equal(repeated.status, 200); assert.equal((await repeated.json()).post.status, 'closed');
  const deleted = await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'delete'), db, at(FIXED));
  assert.equal(deleted.status, 200); assert.deepEqual(await deleted.json(), { ok: true, deleted: true });
  assert.equal(rows(db).length, 0);
  assert.equal((await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'status'), db, at(FIXED))).status, 404);
});

test('management rejects malformed actions and unknown payload fields before reading storage', async () => {
  const db = database(), submitted = await submit(db), previousCalls = db.calls.length;
  for (const action of ['approve', 'reopen', '', null, ['status'], { toString: 'status' }]) {
    const response = await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, action), db, at(FIXED));
    assert.equal(response.status, 400);
  }
  assert.equal((await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'status', { diagnostic: true }), db, at(FIXED))).status, 400);
  assert.equal(db.calls.length, previousCalls);
  assert.equal((await handleTradeManage('unknown-id', manageRequest(submitted.input.ownerKey, 'status'), db, at(FIXED))).status, 404);
});

test('retries with the same capability return one original record without consuming another admission slot', async () => {
  const db = database(), input = body();
  const first = await handleTradeSubmission(request(input), db, at(FIXED)); const receipt = await first.json();
  const retry = await handleTradeSubmission(request({ ...input, ownerKey: input.ownerKey.toUpperCase(), notes: '재시도 중 바뀐 내용은 원본을 수정하지 않습니다.' }), db, at(FIXED + 1000));
  assert.equal(retry.status, 201); const repeated = await retry.json();
  assert.equal(repeated.id, receipt.id); assert.equal(repeated.duplicate, true);
  assert.equal(rows(db).length, 1); assert.equal(rows(db)[0].notes, input.notes);
  assert.ok(rows(db, 'trade_post_rate_limits').every(row => row.count === 1));
  assert.equal(JSON.stringify(repeated).includes(input.ownerKey), false);
});

test('a lost creation response can be recovered by the saved management key without exposing the key', async () => {
  const db = database(), input = body();
  // The server commits, but the caller does not receive or parse its receipt.
  await handleTradeSubmission(request(input), db, at(FIXED));
  const committedId = rows(db)[0].id, before = rows(db);
  const recovered = await handleTradeRecovery(request({ ownerKey: input.ownerKey.toUpperCase() }, '/api/trades/recover'), db, at(FIXED));
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get('Cache-Control'), 'no-store');
  assert.equal(recovered.headers.get('X-Robots-Tag'), 'noindex');
  const receipt = await recovered.json();
  assert.equal(receipt.post.id, committedId); assert.equal(receipt.post.status, 'pending');
  assert.equal(receipt.post.contactValue, '123456789012');
  for (const key of ['ownerKey', 'owner_key_hash', 'visitor_hash']) assert.equal(Object.hasOwn(receipt.post, key), false);
  assert.equal(JSON.stringify(receipt).toLowerCase().includes(input.ownerKey), false);
  assert.deepEqual(rows(db), before, 'recovery is a read, not another publication or registration');
  approve(db, committedId);
  const expired = await handleTradeRecovery(request({ ownerKey: input.ownerKey }, '/api/trades/recover'), db, at(FIXED + 3 * 86400000));
  assert.equal(expired.status, 200); assert.equal((await expired.json()).post.status, 'expired');
  assert.equal((await handleTradeGet(committedId, db, at(FIXED + 3 * 86400000))).status, 404);
});

test('recovery denies other keys, extra fields and cross-origin requests without disclosing whether a post exists', async () => {
  const db = database(); await submit(db);
  const stranger = await handleTradeRecovery(request({ ownerKey: ownerKey() }, '/api/trades/recover'), db, at(FIXED));
  assert.equal(stranger.status, 404);
  assert.equal((await stranger.text()).includes('123456789012'), false);
  for (const payload of [{ ownerKey: 'bad' }, { ownerKey: OWNER, action: 'status' }, {}, { ownerKey: OWNER, id: rows(db)[0].id }]) {
    assert.equal((await handleTradeRecovery(request(payload, '/api/trades/recover'), db, at(FIXED))).status, 400);
  }
  assert.equal((await handleTradeRecovery(request({ ownerKey: OWNER }, '/api/trades/recover', { Origin: 'https://other.example' }), db, at(FIXED))).status, 403);
  assert.equal((await handleTradeRecovery(request({ ownerKey: OWNER }, '/api/trades/recover'), undefined, at(FIXED))).status, 503);
});

test('invalid trade content, origin and actual oversized streamed bodies are rejected before SQL', async () => {
  const db = database();
  for (const patch of [{ contactPublicConsent: false }, { offer: { speciesId: 999999, shiny: false } }, { expiresInDays: 2 }, { cityId: 'unknown' }, { contactKind: 'kakao', contactValue: 'https://evil.example/o/x' }]) {
    assert.equal((await handleTradeSubmission(request(body(patch)), db, at(FIXED))).status, 400);
  }
  const cases = [
    [request(body(), '/api/trades', { Origin: 'https://other.example' }), 403],
    [request(body(), '/api/trades', { Origin: '' }), 403],
    [request(body(), '/api/trades', { 'Sec-Fetch-Site': 'cross-site' }), 403],
    [request(body(), '/api/trades', { 'Content-Type': 'text/plain' }), 415],
    [request(body(), '/api/trades', { 'Content-Length': String(12 * 1024 + 1) }), 413],
    [request(body({ notes: 'x'.repeat(12 * 1024) }), '/api/trades', { 'Content-Length': '1' }), 413],
    [new Request(`${ORIGIN}/api/trades`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{bad' }), 400],
  ];
  for (const [value, status] of cases) assert.equal((await handleTradeSubmission(value, db, at(FIXED))).status, status);
  const management = await handleTradeManage('550e8400-e29b-41d4-a716-446655440001', new Request(`${ORIGIN}/api/trades/manage`), db, at(FIXED));
  assert.equal(management.status, 405);
  assert.equal(db.calls.length, 0);
});

test('honeypot and storage outages cannot pretend a private or public trade post was stored', async () => {
  const db = database();
  const ignored = await handleTradeSubmission(request(body({ website: 'spam.example' })), db, at(FIXED));
  assert.equal(ignored.status, 202); assert.equal(db.calls.length, 0); assert.equal(rows(db).length, 0);
  assert.equal((await handleTradeSubmission(request(body()), undefined, at(FIXED))).status, 503);
  assert.equal((await handleTradesGet(listRequest(), undefined, at(FIXED))).status, 503);
  const id = '550e8400-e29b-41d4-a716-446655440001';
  assert.equal((await handleTradeGet(id, undefined, at(FIXED))).status, 503);
  assert.equal((await handleTradeManage(id, manageRequest(OWNER, 'status'), undefined, at(FIXED))).status, 503);
  const broken = { prepare() { throw new Error('private SQL diagnostic and credentials'); } };
  for (const response of [await handleTradeSubmission(request(body()), broken, at(FIXED)), await handleTradesGet(listRequest(), broken, at(FIXED))]) {
    assert.equal(response.status, 503); const text = await response.text();
    assert.equal(text.includes('private SQL diagnostic'), false); assert.equal(text.includes(OWNER), false);
  }
});

test('real SQL admission limits a visitor to three new posts per hour while allowing its retry', async () => {
  const db = database(), submissions = [];
  for (let index = 0; index < 3; index++) submissions.push(await submit(db, { trainerName: `제보자 ${index}` }));
  const denied = await handleTradeSubmission(request(body({ ownerKey: ownerKey() })), db, at(FIXED));
  assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('Retry-After')) > 0);
  const retry = await handleTradeSubmission(request(submissions[0].input), db, at(FIXED));
  assert.equal(retry.status, 201); assert.equal((await retry.json()).id, submissions[0].id);
  assert.equal(rows(db).length, 3);
  await submit(db, {}, FIXED + 3600000); assert.equal(rows(db).length, 4);
});

test('real SQL admission enforces the global thousand-post daily limit', async () => {
  const db = database(); await submit(db);
  const original = rows(db)[0], columns = Object.keys(original);
  const insert = db.sql.prepare(`INSERT INTO trade_posts (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (let index = 1; index < 1000; index++) {
    const row = { ...original, id: crypto.randomUUID(), owner_key_hash: index.toString(16).padStart(64, '0'), visitor_hash: index.toString(16).padStart(64, '0'),
      status: 'approved', review_note: '모집 내용을 검토한 테스트 자료', reviewed_at: Math.floor(FIXED / 1000), published_at: Math.floor(FIXED / 1000) };
    assert.equal(Number(insert.run(...columns.map(column => row[column])).changes), 1);
  }
  const denied = await handleTradeSubmission(request(body({ ownerKey: ownerKey(), visitorId: crypto.randomUUID() })), db, at(FIXED));
  assert.equal(denied.status, 429); assert.equal(rows(db).length, 1000);
});

test('pending admission counts only unexpired posts and stops at five hundred active reviews', async () => {
  const db = database(), first = await submit(db);
  const original = rows(db)[0], columns = Object.keys(original);
  const insert = db.sql.prepare(`INSERT INTO trade_posts (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (let index = 1; index < 500; index++) {
    const row = { ...original, id: crypto.randomUUID(), owner_key_hash: index.toString(16).padStart(64, '0'), visitor_hash: index.toString(16).padStart(64, '0') };
    assert.equal(Number(insert.run(...columns.map(column => row[column])).changes), 1);
  }
  assert.equal((await handleTradeSubmission(request(body({ ownerKey: ownerKey(), visitorId: crypto.randomUUID() })), db, at(FIXED))).status, 429);
  const seconds = Math.floor(FIXED / 1000);
  db.sql.prepare('UPDATE trade_posts SET created_at = ?, expires_at = ? WHERE id = ?').run(seconds - 86400, seconds, first.id);
  await submit(db, { visitorId: crypto.randomUUID() });
  assert.equal(rows(db).length, 501);
});


test('background metadata survives submission, private recovery, public listing and detail without contact leaks', async () => {
  const db = database();
  const input = {
    offer: { speciesId: 25, shiny: true, form: 'Captain hat', background: { kind: 'location', name: 'Osaka 2025' } },
    want: { speciesId: 800, shiny: false, form: '', background: { kind: 'special', name: 'Ultra Wormhole' } },
  };
  const submitted = await submit(db, input), stored = rows(db)[0];
  assert.equal(stored.offer_background_kind, 'location'); assert.equal(stored.offer_background_name, 'Osaka 2025');
  assert.equal(stored.want_background_kind, 'special'); assert.equal(stored.want_background_name, 'Ultra Wormhole');
  const owner = (await (await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'status'), db, at(FIXED))).json()).post;
  assert.deepEqual(owner.offer, input.offer); assert.deepEqual(owner.want, input.want);
  const recovered = (await (await handleTradeRecovery(request({ownerKey:submitted.input.ownerKey}, '/api/trades/recover'), db, at(FIXED))).json()).post;
  assert.deepEqual(recovered.offer, input.offer); assert.deepEqual(recovered.want, input.want);
  approve(db, submitted.id);
  const publicPost = (await (await handleTradesGet(listRequest(), db, at(FIXED))).json()).posts[0];
  assert.deepEqual(publicPost.offer, input.offer); assert.deepEqual(publicPost.want, input.want);
  assert.equal(Object.hasOwn(publicPost, 'contactValue'), false);
  assert.equal(Object.hasOwn(publicPost, 'ownerKey'), false);
  const detailed = (await (await handleTradeGet(submitted.id, db, at(FIXED))).json()).post;
  assert.deepEqual(detailed.offer, input.offer); assert.deepEqual(detailed.want, input.want);
  assert.equal(detailed.contactValue, '123456789012');
});

test('explicit no-background and any-background choices roundtrip while unspecified is not rewritten to none', async () => {
  const db = database(), submitted = await submit(db, {
    offer: { ...body().offer, background: { kind: 'none', name: '' } },
    want: { ...body().want, background: { kind: 'any', name: '' } },
  });
  const read = (await (await handleTradeManage(submitted.id, manageRequest(submitted.input.ownerKey, 'status'), db, at(FIXED))).json()).post;
  assert.deepEqual(read.offer.background, {kind:'none',name:''});
  assert.deepEqual(read.want.background, {kind:'any',name:''});
  const unspecified = await submit(db);
  const oldShape = (await (await handleTradeManage(unspecified.id, manageRequest(unspecified.input.ownerKey, 'status'), db, at(FIXED))).json()).post;
  assert.equal(Object.hasOwn(oldShape.offer, 'background'), false);
  assert.equal(Object.hasOwn(oldShape.want, 'background'), false);
  assert.equal(rows(db)[1].offer_background_kind, null);
});

test('new additive background migration preserves an existing approved record and its management capability', async () => {
  const backgroundMigrationIndex = migrationFiles.findIndex(name => name.startsWith('0003_'));
  assert.ok(backgroundMigrationIndex >= 0);
  assert.equal(migrations[backgroundMigrationIndex].includes('DROP TABLE'), false);
  const db = database(backgroundMigrationIndex), id = crypto.randomUUID(), seconds = Math.floor(FIXED / 1000);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pokedoko-trade-owner-v1:${OWNER}`));
  const ownerHash = Buffer.from(digest).toString('hex');
  db.sql.prepare(`INSERT INTO trade_posts (id,owner_key_hash,visitor_hash,trainer_name,city_id,mode,
    offer_species_id,offer_shiny,offer_form,want_species_id,want_shiny,want_form,contact_kind,contact_value,contact_public_consent,
    notes,status,created_at,expires_at,hour_bucket,day_bucket,review_note,reviewed_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,ownerHash,'1'.repeat(64),'기존 작성자','seoul','local',25,0,'',1,1,'','friend_code','123456789012',1,'기존 모집 글','approved',seconds,seconds+86400,seconds,seconds,'기존 검토 근거를 유지합니다.',seconds,seconds);
  const before = rows(db)[0]; for (const migration of migrations.slice(backgroundMigrationIndex)) db.sql.exec(migration);
  const after = rows(db)[0];
  for (const [key,value] of Object.entries(before)) assert.equal(after[key],value,key);
  assert.equal(after.offer_background_kind,null); assert.equal(after.want_background_kind,null);
  assert.equal(after.offer_background_name,''); assert.equal(after.want_background_name,'');
  const listed = (await (await handleTradesGet(listRequest(), db, at(FIXED))).json()).posts[0];
  assert.equal(listed.id,id); assert.equal(Object.hasOwn(listed.offer,'background'),false);
  const managed = await handleTradeManage(id, manageRequest(OWNER,'status'), db, at(FIXED));
  assert.equal(managed.status,200); assert.equal((await managed.json()).post.trainerName,'기존 작성자');
});

test('visible variant filters use the full SQL set for pagination and totals and combine with city and species', async () => {
  const db=database();
  const samples=[
    {offer:{...body().offer,shiny:true}},
    {cityId:'tokyo',offer:{...body().offer,form:'Party hat',background:{kind:'location',name:'Osaka'}}},
    {want:{...body().want,shiny:false,background:{kind:'any',name:''}}},
  ];
  const posts=[];
  for (let i=0;i<samples.length;i++) { const result=await submit(db,{visitorId:crypto.randomUUID(),...samples[i]});approve(db,result.id);posts.push(result); }
  const none=await submit(db,{visitorId:crypto.randomUUID(),want:{...body().want,shiny:false,background:{kind:'none',name:''}}});approve(db,none.id);
  const query=async filter=>(await(await handleTradesGet(listRequest(filter),db,at(FIXED))).json());
  assert.equal((await query('variant=shiny')).total,2);
  assert.equal((await query('variant=background')).total,2);
  assert.equal((await query('variant=costume')).total,1);
  assert.equal((await query('variant=background&city=seoul&speciesId=1')).total,1);
  assert.equal((await query('variant=costume&page=2')).total,1);
  assert.equal((await query('variant=costume&page=2')).posts.length,0);
  const invalid=await handleTradesGet(listRequest('variant=unexpected'),db,at(FIXED));assert.equal(invalid.status,400);
});

test('invalid background choices are rejected before SQL and malformed stored metadata fails closed', async () => {
  const db=database();
  for (const background of [{kind:'any',name:''},{kind:'location',name:''},{kind:'other',name:'Osaka'},{kind:{toString:'bad'},name:''}]) {
    assert.equal((await handleTradeSubmission(request(body({offer:{...body().offer,background}})),db,at(FIXED))).status,400);
  }
  assert.equal(db.calls.length,0);
  const posted=await submit(db);approve(db,posted.id);
  db.sql.prepare('UPDATE trade_posts SET offer_background_kind=?,offer_background_name=? WHERE id=?').run('invalid','x',posted.id);
  assert.equal((await handleTradesGet(listRequest(),db,at(FIXED))).status,503);
  assert.equal((await handleTradeGet(posted.id,db,at(FIXED))).status,503);
});
