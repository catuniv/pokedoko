import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(new URL('../scripts/routes-review.mjs', import.meta.url), 'utf8');
const ID = '550e8400-e29b-41d4-a716-446655440001';
class CliExit extends Error {
  constructor(code) { super(`CLI exited with ${code}`); this.code = code; }
}

/** Run the actual CLI in memory with no child process, credentials, file export or real database. */
async function runWithCorruptedGeometry(action) {
  const hook = `__pokedokoRouteReviewTest_${crypto.randomUUID().replaceAll('-', '')}`;
  const calls = [], logs = [];
  const status = action === 'reject' ? 'rejected' : action === 'remove' ? 'removed' : 'approved';
  const originalStatus = action === 'remove' ? 'approved' : 'pending';
  globalThis[hook] = {
    ts,
    console: { log(...values) { logs.push(values.join(' ')); }, table() { throw new Error('Unexpected list output'); } },
    process: {
      argv: ['node', 'routes-review.mjs', action, ID, '--note', '손상된 경로 자료의 공개를 중단하거나 재검토합니다.', '--rights-checked', '--game-route-checked'],
      execPath: process.execPath, env: {}, stderr: { write(value) { logs.push(String(value)); } },
      exit(code) { throw new CliExit(code); },
    },
    spawnSync(_node, args) {
      const sql = args[args.indexOf('--command') + 1];
      calls.push(sql);
      const results = sql.startsWith('SELECT ')
        ? [{ id: ID, status: originalStatus, points_json: '{broken-json' }]
        : [{ id: ID, status }];
      return { status: 0, stdout: JSON.stringify([{ success: true, results }]), stderr: '' };
    },
  };
  const replace = (input, before, after) => {
    assert.ok(input.includes(before), 'CLI test injection boundary changed');
    return input.replace(before, after);
  };
  let instrumented = replace(source, 'import { spawnSync } from "node:child_process";', `const spawnSync = globalThis[${JSON.stringify(hook)}].spawnSync;`);
  instrumented = replace(instrumented, 'import ts from "typescript";', `const ts = globalThis[${JSON.stringify(hook)}].ts;`);
  instrumented = replace(instrumented, 'const root = fileURLToPath(new URL("../", import.meta.url));', `const root = ${JSON.stringify(root)};`);
  instrumented = `const process = globalThis[${JSON.stringify(hook)}].process; const console = globalThis[${JSON.stringify(hook)}].console;\n${instrumented}`;
  let error, exitCode;
  try { await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}#${hook}`); }
  catch (cause) { if (cause instanceof CliExit) exitCode = cause.code; else error = cause; }
  finally { delete globalThis[hook]; }
  return { calls, logs, error, exitCode };
}

test('operator can reject a pending route even if its stored geometry JSON is corrupted', async () => {
  const result = await runWithCorruptedGeometry('reject');
  assert.equal(result.error, undefined);
  assert.equal(result.exitCode, 0);
  const updates = result.calls.filter(sql => sql.startsWith('UPDATE '));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].includes("status='rejected'"));
  assert.ok(updates[0].includes(`WHERE id='${ID}'`));
});

test('operator can remove a published route even if its stored geometry JSON is corrupted', async () => {
  const result = await runWithCorruptedGeometry('remove');
  assert.equal(result.error, undefined);
  assert.equal(result.exitCode, 0);
  const updates = result.calls.filter(sql => sql.startsWith('UPDATE '));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].includes("status='removed'"));
  assert.ok(updates[0].includes(`WHERE id='${ID}'`));
});

test('approval cannot publish corrupted geometry even with both review flags and a valid note', async () => {
  const result = await runWithCorruptedGeometry('approve');
  assert.ok(result.error instanceof SyntaxError);
  assert.equal(result.calls.filter(sql => sql.startsWith('UPDATE ')).length, 0);
  assert.equal(result.logs.some(message => message.includes('공개 완료')), false);
});
