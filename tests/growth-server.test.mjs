import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const { CITIES } = await import(moduleUrl(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8')));
const source = (await readFile(new URL('../lib/growth-server.ts', import.meta.url), 'utf8')).replace('import { CITIES } from "./cities";', `const CITIES = ${JSON.stringify(CITIES)};`);
const { handleUsageRequest, handleFeedbackRequest, growthMethodNotAllowed, pruneGrowthData, createGrowthRetentionScheduler } = await import(moduleUrl(source));
const migration = await readFile(new URL('../drizzle/0000_sour_zaladane.sql', import.meta.url), 'utf8');
const FIXED = Date.parse('2026-11-10T15:00:01Z');
const visitor = '550e8400-e29b-41d4-a716-446655440000';
const other = '550e8400-e29b-41d4-a716-446655440001';
const body = patch => ({ visitorId: visitor, event: 'page_view', view: 'live', city: 'seoul', source: 'dc', ...patch });
const feedback = patch => ({ visitorId: visitor, category: 'bug', page: 'live', city: 'seoul', message: '레이드 목록을 확인하다가 오류가 발생했습니다.', ...patch });
const request = (payload, headers = {}) => new Request('https://pokedoko.example/api/usage', { method: 'POST', headers: { Origin: 'https://pokedoko.example', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
const at = value => () => new Date(value);

/** Real SQLite executes the actual migration and queries behind this tiny D1 adapter. */
function database() {
  const sql = new DatabaseSync(':memory:'); sql.exec(migration);
  const calls = [];
  return { sql, calls,
    prepare(query) {
      const make = values => ({
        bind(...next) { return make(next); },
        async first() { calls.push({ query, values }); return sql.prepare(query).get(...values) ?? null; },
        async run() { calls.push({ query, values }); const result = sql.prepare(query).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      });
      return make([]);
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const rows = []; for (const statement of statements) rows.push(await statement.run()); sql.exec('COMMIT'); return rows; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
}
const rows = (db, table) => db.sql.prepare(`SELECT * FROM ${table}`).all().map(row => ({ ...row }));

test('real SQLite migration aggregates successful usage atomically, hashes IDs and deduplicates retries', async () => {
  const db = database();
  const first = await handleUsageRequest(request(body()), db, at(FIXED));
  assert.equal(first.status, 202); assert.deepEqual(await first.json(), { ok: true });
  const repeated = await handleUsageRequest(request(body({ visitorId: visitor.toUpperCase() })), db, at(FIXED + 1000));
  assert.deepEqual(await repeated.json(), { ok: true, duplicate: true });
  const events = rows(db, 'growth_usage_events'); assert.equal(events.length, 1);
  assert.match(events[0].visitor_hash, /^[a-f0-9]{64}$/); assert.equal(events[0].day, '2026-11-11');
  assert.ok(!JSON.stringify(db.calls).includes(visitor));
  assert.equal(rows(db, 'growth_rate_limits')[0].count, 1);
  assert.deepEqual(rows(db, 'growth_daily_summary'), [{ day: '2026-11-11', source: 'dc', page_views: 1, coordinate_copies: 0, shares: 0, unique_visitors: 1, returning_visitors_7d: 0, returning_rate_7d_percent: 0 }]);
});

test('five-second receipt window, KST day rollover and first-source unique attribution stay explicit', async () => {
  const db = database();
  await handleUsageRequest(request(body()), db, at(FIXED));
  await handleUsageRequest(request(body()), db, at(FIXED + 5000));
  await handleUsageRequest(request(body({ source: 'inven', view: 'event', event: 'share' })), db, at(FIXED + 6000));
  assert.equal(rows(db, 'growth_usage_events').length, 3);
  assert.equal(rows(db, 'growth_daily_visitors').length, 1); assert.equal(rows(db, 'growth_daily_visitors')[0].source, 'dc');
  const summary = rows(db, 'growth_daily_summary');
  assert.equal(summary.find(row => row.source === 'dc').unique_visitors, 1);
  assert.equal(summary.find(row => row.source === 'inven').shares, 1);
  assert.equal(summary.find(row => row.source === 'inven').unique_visitors, 0);
  const previous = await handleUsageRequest(request(body({ visitorId: other, view: 'city' })), db, at(FIXED - 2000));
  assert.equal(previous.status, 202); assert.ok(rows(db, 'growth_daily_visitors').some(row => row.day === '2026-11-10'));
});

test('returning visitors require a previous day in the prior seven days, independent of raw receipt retention', async () => {
  const db = database();
  await handleUsageRequest(request(body()), db, at(FIXED));
  await handleUsageRequest(request(body()), db, at(FIXED + 7 * 86400000));
  const returned = rows(db, 'growth_daily_summary').find(row => row.day === '2026-11-18');
  assert.equal(returned.unique_visitors, 1); assert.equal(returned.returning_visitors_7d, 1); assert.equal(returned.returning_rate_7d_percent, 100);
  await handleUsageRequest(request(body({ visitorId: other })), db, at(FIXED));
  await handleUsageRequest(request(body({ visitorId: other })), db, at(FIXED + 8 * 86400000));
  assert.equal(rows(db, 'growth_daily_summary').find(row => row.day === '2026-11-19').returning_visitors_7d, 0);
});

test('single-statement database admission caps usage at thirty per minute across concurrent calls and sources', async () => {
  const db = database();
  const outputs = await Promise.all(Array.from({ length: 31 }, (_, index) => handleUsageRequest(request(body({ city: CITIES[index % CITIES.length].id, event: index < CITIES.length ? 'page_view' : 'coordinate_copy', source: index % 2 ? 'dc' : 'youtube' })), db, at(FIXED))));
  assert.equal(outputs.filter(response => response.status === 202).length, 30);
  assert.equal(outputs.filter(response => response.status === 429).length, 1);
  assert.equal(rows(db, 'growth_usage_events').length, 30); assert.equal(rows(db, 'growth_rate_limits')[0].count, 30);
  const duplicate = await handleUsageRequest(request(body({ city: CITIES[0].id, source: 'youtube' })), db, at(FIXED));
  assert.equal(duplicate.status, 202); assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((await handleUsageRequest(request(body()), db, at(FIXED + 60_000))).status, 202);
});

test('strict schema, origin and actual streamed byte limits reject arbitrary diagnostics before any SQL', async () => {
  const db = database();
  const cases = [
    [body({ ip: '203.0.113.1' }), {}, 400], [body({ query: 'private search' }), {}, 400],
    [body({ lat: 37.5 }), {}, 400], [body({ source: 'https://private.example/full-query' }), {}, 400],
    [body({ event: 'unique_visitor' }), {}, 400], [body({ view: 'privacy' }), {}, 400],
    [body({ city: 'unknown-city' }), {}, 400], [body({ visitorId: 'not-a-uuid' }), {}, 400],
    [body(), { Origin: 'https://evil.example' }, 403], [body(), { Origin: '' }, 403],
    [body(), { 'Content-Type': 'text/plain' }, 415], [body(), { 'Content-Length': '1025' }, 413],
    [{ ...body(), unexpected: 'x'.repeat(2000) }, { 'Content-Length': '1' }, 413],
  ];
  for (const [payload, headers, status] of cases) {
    const result = await handleUsageRequest(request(payload, headers), db, at(FIXED));
    assert.equal(result.status, status); assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  }
  assert.equal(db.calls.length, 0);
  const malformed = new Request('https://pokedoko.example/api/usage', { method: 'POST', headers: { Origin: 'https://pokedoko.example', 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal((await handleUsageRequest(malformed, db)).status, 400);
});

test('D1 absence or errors return 503; browser privacy signals skip usage without blocking explicit feedback', async () => {
  assert.equal((await handleUsageRequest(request(body()))).status, 503);
  const broken = { prepare() { throw new Error('private database text'); } };
  const failure = await handleUsageRequest(request(body()), broken);
  assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /private database text/);
  const db = database();
  for (const header of ['DNT', 'Sec-GPC']) {
    const skipped = await handleUsageRequest(request(body(), { [header]: '1' }), db);
    assert.equal(skipped.status, 202); assert.equal((await skipped.json()).skipped, true);
  }
  assert.equal(db.calls.length, 0);
  assert.equal((await handleFeedbackRequest(request(feedback(), { DNT: '1' }), db)).status, 201);
  assert.equal(rows(db, 'growth_usage_events').length, 0);
});

test('feedback is private, bounded, rate-limited and honeypot submissions never reach D1', async () => {
  const db = database();
  for (let i = 0; i < 3; i++) assert.equal((await handleFeedbackRequest(request(feedback()), db, at(FIXED))).status, 201);
  const capped = await handleFeedbackRequest(request(feedback()), db, at(FIXED));
  assert.equal(capped.status, 429); assert.ok(Number(capped.headers.get('Retry-After')) > 0);
  assert.equal(rows(db, 'growth_feedback').length, 3);
  assert.equal(rows(db, 'feedback_inbox').length, 3);
  assert.ok(rows(db, 'feedback_inbox').every(row => !Object.keys(row).includes('visitor_hash')));
  assert.match(rows(db, 'feedback_inbox')[0].created_at_kst, /^2026-11-11 00:00:01$/);
  assert.equal((await handleFeedbackRequest(request(feedback({ website: 'spam.example' })), db)).status, 202);
  assert.equal(rows(db, 'growth_feedback').length, 3);
  assert.equal((await handleFeedbackRequest(request(feedback()), db, at(FIXED + 3600000))).status, 201);
  assert.equal(growthMethodNotAllowed().status, 405); assert.equal(growthMethodNotAllowed().headers.get('Allow'), 'POST');
});

test('feedback character limits align with SQLite Unicode length and reject extra identifying fields', async () => {
  const db = database();
  assert.equal((await handleFeedbackRequest(request(feedback({ message: '🙂'.repeat(10) })), db)).status, 400);
  assert.equal((await handleFeedbackRequest(request(feedback({ message: '🙂'.repeat(20), page: 'city' })), db)).status, 201);
  assert.equal((await handleFeedbackRequest(request(feedback({ message: '한'.repeat(2000), page: 'event' })), db)).status, 201);
  assert.equal((await handleFeedbackRequest(request(feedback({ message: '한'.repeat(2001) })), db)).status, 400);
  assert.equal((await handleFeedbackRequest(request(feedback({ email: 'not-collected@example.com' })), db)).status, 400);
  assert.equal((await handleFeedbackRequest(request(feedback()))).status, 503);
});

test('bounded retention removes expired private data while preserving ninety-day anonymous aggregate totals', async () => {
  const db = database();
  await handleUsageRequest(request(body()), db, at(FIXED));
  await handleFeedbackRequest(request(feedback()), db, at(FIXED));
  const summary = rows(db, 'growth_daily_summary');
  await pruneGrowthData(db, new Date(FIXED + 31 * 86400000));
  assert.equal(rows(db, 'growth_usage_events').length, 0); assert.equal(rows(db, 'growth_feedback').length, 0);
  assert.equal(rows(db, 'growth_daily_visitors').length, 0); assert.equal(rows(db, 'growth_rate_limits').length, 0);
  assert.deepEqual(rows(db, 'growth_daily_summary'), summary);
  await pruneGrowthData(db, new Date(FIXED + 91 * 86400000));
  assert.equal(rows(db, 'growth_daily_aggregates').length, 0);
  const limited = database();
  for (let i = 0; i < 3; i++) await handleFeedbackRequest(request(feedback()), limited, at(FIXED));
  const one = await pruneGrowthData(limited, new Date(FIXED + 31 * 86400000), 1);
  assert.equal(one.deleted.growth_feedback, 1); assert.equal(rows(limited, 'growth_feedback').length, 2);
  assert.deepEqual(await pruneGrowthData(), { enabled: false, deleted: {} });
  await assert.rejects(pruneGrowthData(db, new Date(), 5001), RangeError);
});

test('retention runs even when the scheduled public source refresh fails, without changing fetch handling', async () => {
  const workerSource = (await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'))
    .replace('import handler from "vinext/server/fetch-handler";', 'const handler = { fetch: async () => new Response("existing-fetch") };')
    .replace('import { runWithConnectorBinding } from "../lib/connector-context";', 'const runWithConnectorBinding = (_binding, callback) => callback();')
    .replace('import { FALLBACK_FEED, loadFeed } from "../lib/feed";', 'const FALLBACK_FEED = {}; const loadFeed = async () => ({});')
    .replace('import { createFeedStore } from "../lib/feed-store";', 'const createFeedStore = () => async () => { throw new Error("source outage"); };')
    .replace('import { getFeedStorageBinding } from "../lib/feed-storage-bindings";', 'const getFeedStorageBinding = () => null;')
    .replace('import { createGrowthRetentionScheduler, pruneGrowthData } from "../lib/growth-server";', `import { createGrowthRetentionScheduler, pruneGrowthData } from '${moduleUrl(source)}';`)
    .replace('import.meta.env.DEV', 'false');
  const { default: worker } = await import(moduleUrl(workerSource));
  const db = database();
  await handleFeedbackRequest(request(feedback()), db, at(Date.now() - 31 * 86400000));
  const info = console.info, error = console.error; console.info = console.error = () => {};
  try { await assert.rejects(worker.scheduled({ cron: '0 0 * * *' }, { DB: db }, {})); }
  finally { console.info = info; console.error = error; }
  assert.equal(rows(db, 'growth_feedback').length, 0);
  assert.equal(await (await worker.fetch(new Request('https://pokedoko.example/'), {}, {})).text(), 'existing-fetch');
});

test('opportunistic retention is throttled per database for an hour and has no work when D1 is absent', async () => {
  const queue = createGrowthRetentionScheduler({ now: at(FIXED) });
  const work = [], context = { waitUntil(promise) { work.push(promise); } };
  assert.equal(queue(undefined, context), false); assert.equal(work.length, 0);
  const first = database(), second = database();
  assert.equal(queue(first, context), true); assert.equal(queue(first, context), false);
  assert.equal(queue(second, context), true); await Promise.all(work);
  assert.equal(first.calls.length, 5); assert.equal(second.calls.length, 5);
  let dynamic = FIXED;
  const hourly = createGrowthRetentionScheduler({ now: () => new Date(dynamic) });
  const hourlyWork = [], ctx = { waitUntil(promise) { hourlyWork.push(promise); } };
  hourly(first, ctx); await Promise.all(hourlyWork);
  dynamic += 3_599_999; assert.equal(hourly(first, ctx), false);
  dynamic += 1; assert.equal(hourly(first, ctx), true); await Promise.all(hourlyWork);
  assert.equal(hourlyWork.length, 2);
});

test('feed fetch schedules bounded cleanup without awaiting it and SQL failures cannot change the response', async () => {
  const workerSource = (await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'))
    .replace('import handler from "vinext/server/fetch-handler";', 'const handler = { fetch: async () => new Response("feed-response") };')
    .replace('import { runWithConnectorBinding } from "../lib/connector-context";', 'const runWithConnectorBinding = (_binding, callback) => callback();')
    .replace('import { FALLBACK_FEED, loadFeed } from "../lib/feed";', 'const FALLBACK_FEED = {}; const loadFeed = async () => ({});')
    .replace('import { createFeedStore } from "../lib/feed-store";', 'const createFeedStore = () => async () => ({});')
    .replace('import { getFeedStorageBinding } from "../lib/feed-storage-bindings";', 'const getFeedStorageBinding = () => null;')
    .replace('import { createGrowthRetentionScheduler, pruneGrowthData } from "../lib/growth-server";', `import { createGrowthRetentionScheduler, pruneGrowthData } from '${moduleUrl(source)}';`)
    .replace('import.meta.env.DEV', 'false');
  const { default: worker } = await import(moduleUrl(workerSource));
  const pending = [], context = { waitUntil(promise) { pending.push(promise); } };
  let batches = 0, rejectBatch;
  const hanging = { prepare() { return { bind() { return {}; } }; }, batch() { batches++; return new Promise((_, reject) => { rejectBatch = reject; }); } };
  const first = await worker.fetch(new Request('https://pokedoko.example/api/feed?status=1'), { DB: hanging }, context);
  assert.equal(await first.text(), 'feed-response'); assert.equal(pending.length, 1); assert.equal(batches, 1);
  await worker.fetch(new Request('https://pokedoko.example/api/feed'), { DB: hanging }, context);
  await worker.fetch(new Request('https://pokedoko.example/calendar'), { DB: hanging }, context);
  await worker.fetch(new Request('https://pokedoko.example/api/feed'), {}, context);
  assert.equal(pending.length, 1); assert.equal(batches, 1);
  const warn = console.warn; console.warn = () => {};
  try { rejectBatch(new Error('private SQL failure')); await Promise.all(pending); }
  finally { console.warn = warn; }
  const response = await worker.fetch(new Request('https://pokedoko.example/api/feed'), { DB: hanging }, context);
  assert.equal(await response.text(), 'feed-response'); assert.equal(batches, 1);
});
