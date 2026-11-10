import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareCloudflareDeploy, validateDeployOptions } from '../scripts/prepare-cloudflare-deploy.mjs';

const ACCOUNT = '8f7264c1a098b3d652e70ca49b8f21d5';
const NAMESPACE = '5c9431a2e80d4f6b97c3d5412a9e08bf';
const DATABASE = '59cd28b1-3914-47f8-9a4b-281698c7ad42';
const options = { accountId: ACCOUNT, kvNamespace: NAMESPACE, name: 'pokedoko' };

async function fixture(t, extra = {}, includeMigrations = true) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'pokedoko-deploy-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'dist/server'), { recursive: true });
  await mkdir(path.join(root, 'dist/client'), { recursive: true });
  const source = {
    main: 'index.js', no_bundle: true, compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'],
    assets: { directory: '../client' }, r2_buckets: [{ binding: 'BUCKET', bucket_name: 'site-creator-r2' }],
    rules: [{ type: 'ESModule', globs: ['**/*.js'] }], d1_databases: [], ...extra,
  };
  await writeFile(path.join(root, 'dist/server/wrangler.json'), JSON.stringify(source));
  await writeFile(path.join(root, 'dist/server/index.js'), 'export default {fetch(){return new Response("fixture")},scheduled(){}};');
  await writeFile(path.join(root, 'dist/client/index.html'), '<!doctype html><title>Fixture</title>');
  if (includeMigrations) {
    await mkdir(path.join(root, 'drizzle/meta'), { recursive: true });
    await writeFile(path.join(root, 'drizzle/0000_fixture.sql'), 'CREATE TABLE fixture (id TEXT PRIMARY KEY);\n');
    await writeFile(path.join(root, 'drizzle/meta/_journal.json'), '{"entries":[]}\n');
  }
  return { root, source };
}

const dbBinding = () => [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }];

test('deploy options preserve KV/R2 exclusivity and validate real D1 IDs and database names', () => {
  assert.equal(validateDeployOptions(options).kvNamespace, NAMESPACE);
  assert.equal(validateDeployOptions({ accountId: ACCOUNT, bucket: 'pokedoko-cache' }).bucket, 'pokedoko-cache');
  assert.throws(() => validateDeployOptions({ ...options, bucket: 'pokedoko-cache' }), /exactly one/);
  assert.throws(() => validateDeployOptions({ ...options, d1Name: 'pokedoko-growth' }), /requires --d1-id/);
  for (const d1Id of ['', 'YOUR_DATABASE_UUID', '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000000', '../../database']) assert.throws(() => validateDeployOptions({ ...options, d1Id }), /actual UUID/);
  for (const d1Name of ['', 'site-creator-d1', 'your-database', '../other', 'a'.repeat(64)]) assert.throws(() => validateDeployOptions({ ...options, d1Id: DATABASE, d1Name }));
  const mapped = validateDeployOptions({ ...options, d1Id: DATABASE.toUpperCase() });
  assert.equal(mapped.d1Id, DATABASE);
  assert.equal(mapped.d1Name, 'pokedoko-growth');
});

test('a build without DB keeps old KV and R2 preparation behavior and preserves the source', async t => {
  const { root } = await fixture(t);
  const before = await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8');
  const kv = await prepareCloudflareDeploy(options, root);
  const config = JSON.parse(await readFile(kv.configPath, 'utf8'));
  assert.equal(config.account_id, ACCOUNT);
  assert.deepEqual(config.kv_namespaces, [{ binding: 'SCHEDULE_CACHE', id: NAMESPACE }]);
  assert.deepEqual(config.triggers, { crons: ['0 0 * * *'] });
  assert.equal(config.r2_buckets, undefined);
  assert.equal(config.d1_databases, undefined);
  await assert.rejects(prepareCloudflareDeploy(options, root), /already exists/);
  const r2 = await prepareCloudflareDeploy({ accountId: ACCOUNT, bucket: 'pokedoko-cache', name: 'pokedoko-r2' }, root);
  const old = JSON.parse(await readFile(r2.configPath, 'utf8'));
  assert.deepEqual(old.r2_buckets, [{ binding: 'BUCKET', bucket_name: 'pokedoko-cache' }]);
  assert.equal(old.kv_namespaces, undefined);
  assert.equal(old.d1_databases, undefined);
  assert.equal(old.triggers, undefined);
  assert.equal(await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'), before);
});

test('DB mapping uses only the supplied external ID and copies SQL/meta without changing source files', async t => {
  const { root } = await fixture(t, { d1_databases: dbBinding() });
  const source = await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8');
  const result = await prepareCloudflareDeploy({ ...options, d1Id: DATABASE }, root);
  const config = JSON.parse(await readFile(result.configPath, 'utf8'));
  assert.deepEqual(config.d1_databases, [{ binding: 'DB', database_name: 'pokedoko-growth', database_id: DATABASE, migrations_dir: '../drizzle' }]);
  assert.deepEqual(config.triggers, { crons: ['0 0 * * *'] });
  for (const file of ['0000_fixture.sql', 'meta/_journal.json']) {
    assert.equal(await readFile(path.join(result.output, 'drizzle', file), 'utf8'), await readFile(path.join(root, 'drizzle', file), 'utf8'));
  }
  assert.equal(await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'), source);
  assert.equal(JSON.parse(await readFile(path.join(result.output, 'preparation.json'), 'utf8')).database.name, 'pokedoko-growth');
});

test('DB-enabled builds require explicit mapping and stale DB-free builds reject D1 flags', async t => {
  const withDb = await fixture(t, { d1_databases: dbBinding() });
  await assert.rejects(prepareCloudflareDeploy(options, withDb.root), /provide --d1-id/);
  const withoutDb = await fixture(t);
  await assert.rejects(prepareCloudflareDeploy({ ...options, d1Id: DATABASE }, withoutDb.root), /Rebuild the DB-enabled source/);
});

test('additional bindings and unreviewed D1 settings are still rejected', async t => {
  for (const extra of [
    { d1_databases: [...dbBinding(), { binding: 'OTHER_DB' }] },
    { d1_databases: [{ ...dbBinding()[0], binding: 'OTHER_DB' }] },
    { d1_databases: [{ ...dbBinding()[0], preview_database_id: DATABASE }] },
    { d1_databases: dbBinding(), services: [{ binding: 'OTHER', service: 'other' }] },
  ]) {
    const { root } = await fixture(t, extra);
    await assert.rejects(prepareCloudflareDeploy({ ...options, d1Id: DATABASE }, root), /review|mapping/i);
  }
});

test('DB preparation refuses missing migrations and symlinks instead of copying external files', async t => {
  const missing = await fixture(t, { d1_databases: dbBinding() }, false);
  await assert.rejects(prepareCloudflareDeploy({ ...options, d1Id: DATABASE }, missing.root), /drizzle/);
  const linked = await fixture(t, { d1_databases: dbBinding() });
  await symlink(path.join(linked.root, 'dist/server/index.js'), path.join(linked.root, 'drizzle/linked.sql'));
  await assert.rejects(prepareCloudflareDeploy({ ...options, d1Id: DATABASE }, linked.root), /symlink/);
});

test('Wrangler accepts the mapped KV + D1 configuration in local dry-run without migration or deployment', async t => {
  const { root } = await fixture(t, { d1_databases: dbBinding() });
  const result = await prepareCloudflareDeploy({ ...options, d1Id: DATABASE }, root);
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const child = spawnSync(process.execPath, [wrangler, 'deploy', '--config', result.configPath, '--dry-run', '--outdir', path.join(result.output, 'dry-run'), '--experimental-autoconfig=false'], {
    cwd: result.output,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(root, 'wrangler.log') },
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(child.status, 0, `${child.error?.message ?? ''}\n${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /--dry-run: exiting now/);
  assert.match(child.stdout, /env\.DB/);
  assert.match(child.stdout, /env\.SCHEDULE_CACHE/);
});
