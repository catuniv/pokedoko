import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const fixture = { feed: { error: null, fetchedAt: '2026-11-10T04:00:00Z', events: [], bosses: [] }, storage: 'ready', storedAt: '2026-11-10T04:00:00Z', cache: 'kv' };
const workerSource = (await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'))
  .replace('import handler from "vinext/server/fetch-handler";', 'const handler = { fetch: async () => new Response("existing fetch") };')
  .replace('import { runWithConnectorBinding } from "../lib/connector-context";', 'const runWithConnectorBinding = (_binding, callback) => callback();')
  .replace('import { FALLBACK_FEED, loadFeed } from "../lib/feed";', 'const FALLBACK_FEED = {}; const loadFeed = async () => ({});')
  .replace('import { getFeedStorageBinding } from "../lib/feed-storage-bindings";', 'const getFeedStorageBinding = () => ({ kind: "kv" });')
  .replace('import { createFeedStore } from "../lib/feed-store";', `const createFeedStore = () => async () => { observed.push({ kind: "feed" }); if (mode.feed === "error") throw new Error("private feed diagnostic"); return ${JSON.stringify(fixture)}; };`)
  .replace('import { createGrowthRetentionScheduler, pruneGrowthData } from "../lib/growth-server";', 'const createGrowthRetentionScheduler = () => () => false; const pruneGrowthData = async () => { observed.push({ kind: "retention" }); if (mode.retention === "error") throw new Error("private retention diagnostic"); return { enabled: false, deleted: {} }; };')
  .replace('import { getTradeBackgroundCatalog } from "../lib/trade-background-catalog-server";', 'const getTradeBackgroundCatalog = async (_env, options) => { observed.push({ kind: "background", force: options.force }); if (mode.background === "error") throw new Error("private background diagnostic"); return { stale: mode.background === "stale", storage: mode.background === "unstored" ? "unavailable" : "ready", fetchedAt: "2026-11-10T04:00:00Z", sourceUpdatedAt: "2026-08-31", presets: [] }; };')
  .replace('import.meta.env.DEV', 'false');
const { default: worker, observed, mode } = await import(moduleUrl(`export const observed = []; export const mode = { feed: "ready", retention: "ready", background: "ready" };\n${workerSource}`));

test('daily cron refreshes backgrounds independently and requires a persisted successful result', async () => {
  const info = console.info, error = console.error, messages = [];
  console.info = (...args) => messages.push(args); console.error = (...args) => messages.push(args);
  try {
    await worker.scheduled({ cron: '0 0 * * *' }, {}, {});
    assert.deepEqual(observed.map(item => item.kind).sort(), ['background', 'feed', 'retention']);
    assert.equal(observed.find(item => item.kind === 'background').force, true);
    for (const background of ['stale', 'unstored', 'error']) {
      observed.length = 0; mode.background = background;
      await assert.rejects(worker.scheduled({ cron: '0 0 * * *' }, {}, {}), /Trade background catalog refresh failed/);
      assert.deepEqual(observed.map(item => item.kind).sort(), ['background', 'feed', 'retention']);
    }
    mode.background = 'ready'; mode.feed = 'error'; observed.length = 0;
    await assert.rejects(worker.scheduled({ cron: '0 0 * * *' }, {}, {}), /Scheduled public feed refresh failed/);
    assert.deepEqual(observed.map(item => item.kind).sort(), ['background', 'feed', 'retention']);
    mode.feed = 'ready'; mode.retention = 'error';
    await assert.rejects(worker.scheduled({ cron: '0 0 * * *' }, {}, {}), /Growth retention failed/);
    assert.doesNotMatch(JSON.stringify(messages), /private .* diagnostic/);
    assert.equal(await (await worker.fetch(new Request('https://example.com/'), {}, {})).text(), 'existing fetch');
  } finally { console.info = info; console.error = error; mode.feed = mode.retention = mode.background = 'ready'; }
});
