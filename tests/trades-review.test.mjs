import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(new URL('../scripts/trades-review.mjs', import.meta.url), 'utf8');
const ID = '550e8400-e29b-41d4-a716-446655440001';

/** Execute the actual review command without launching Wrangler or reading any account credentials. */
async function approveWithContact(contact) {
  const hook = `__pokedokoTradeReview_${crypto.randomUUID().replaceAll('-', '')}`;
  const calls = [], logs = [], seconds = Math.floor(Date.now() / 1000);
  const row = { id: ID, trainer_name: '검토 테스트 트레이너', city_id: 'seoul', mode: 'local',
    offer_species_id: 25, offer_shiny: 0, offer_form: '', want_species_id: 1, want_shiny: 0, want_form: '',
    contact_kind: 'friend_code', contact_value: contact, contact_public_consent: 1, notes: '모집 내용 검토용 테스트입니다.',
    status: 'pending', created_at: seconds, expires_at: seconds + 86400 };
  globalThis[hook] = {
    ts, console: { log(...values) { logs.push(values.join(' ')); }, table() {} },
    process: { argv: ['node', 'trades-review.mjs', 'approve', ID, '--checked', '--note', '연락처 공개 동의와 모집 내용을 검토했습니다.'], execPath: process.execPath, env: {}, stderr: { write() {} }, exit(code) { throw new Error(`Unexpected CLI exit: ${code}`); } },
    spawnSync(_command, args) {
      const sql = args[args.indexOf('--command') + 1]; calls.push(sql);
      return { status: 0, stdout: JSON.stringify([{ success: true, results: sql.startsWith('SELECT ') ? [row] : [{ id: ID, status: 'approved' }] }]), stderr: '' };
    },
  };
  const replace = (value, before, after) => { assert.ok(value.includes(before), 'CLI test injection boundary changed'); return value.replace(before, after); };
  let instrumented = replace(source, 'import { spawnSync } from "node:child_process";', `const spawnSync = globalThis[${JSON.stringify(hook)}].spawnSync;`);
  instrumented = replace(instrumented, 'import ts from "typescript";', `const ts = globalThis[${JSON.stringify(hook)}].ts;`);
  instrumented = replace(instrumented, 'const root = fileURLToPath(new URL("../", import.meta.url));', `const root = ${JSON.stringify(root)};`);
  instrumented = `const process = globalThis[${JSON.stringify(hook)}].process; const console = globalThis[${JSON.stringify(hook)}].console;\n${instrumented}\n//# sourceURL=trade-review-test-runtime.js`;
  let errorMessage;
  try { await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}#${hook}`); }
  catch (cause) { errorMessage = cause instanceof Error ? cause.message : String(cause); }
  finally { delete globalThis[hook]; }
  return { calls, logs, errorMessage };
}

test('review rejects noncanonical stored contact data before publication, while valid canonical data can publish', async () => {
  const malformed = await approveWithContact('1234 5678 9012');
  assert.match(malformed.errorMessage ?? '', /정규 형식/);
  assert.equal(malformed.calls.filter(sql => sql.startsWith('UPDATE ')).length, 0);
  assert.equal(malformed.logs.some(message => message.includes('공개 완료')), false);
  const valid = await approveWithContact('123456789012');
  assert.equal(valid.errorMessage, undefined);
  assert.equal(valid.calls.filter(sql => sql.startsWith('UPDATE ')).length, 1);
  assert.ok(valid.logs.some(message => message.includes('공개 완료')));
  assert.equal(valid.calls.some(sql => sql.includes('owner_key_hash')), false);
  assert.equal(valid.logs.some(message => message.includes('123456789012')), false);
});
