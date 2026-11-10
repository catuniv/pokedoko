import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText + '\n//# sourceURL=trade-test-runtime.js').toString('base64')}`;
const citiesUrl = moduleUrl(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const names = JSON.parse(await readFile(new URL('../lib/pokemon-names.json', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../lib/trades.ts', import.meta.url), 'utf8'))
  .replace(/from (["'])\.\/cities\1/g, `from '${citiesUrl}'`)
  .replace('import POKEMON_NAMES from "./pokemon-names.json";', `const POKEMON_NAMES = ${JSON.stringify(names)};`);
const { TradeValidationError, validateTradeSubmission, normalizeTradeContact, validTradeOwnerKey, tradePokemonName } = await import(moduleUrl(source));
const OWNER = '0123456789abcdef'.repeat(4);
const body = patch => ({
  visitorId: '550e8400-e29b-41d4-a716-446655440000', ownerKey: OWNER,
  trainerName: '테스트 트레이너', cityId: 'seoul', mode: 'local',
  offer: { speciesId: 25, shiny: false, form: '' }, want: { speciesId: 1, shiny: true, form: '' },
  contactKind: 'friend_code', contactValue: '1234 5678-9012', contactPublicConsent: true,
  notes: '대면 교환 조건을 먼저 확인해 주세요.', expiresInDays: 3, ...patch,
});
const invalid = callback => assert.throws(callback, TradeValidationError);

test('trade submissions normalize public contact and private keys without inferring a completed game trade', () => {
  const accepted = validateTradeSubmission(body({ trainerName: '  테스트 트레이너  ', ownerKey: OWNER.toUpperCase(), visitorId: body().visitorId.toUpperCase() }));
  assert.equal(accepted.trainerName, '테스트 트레이너');
  assert.equal(accepted.contactValue, '123456789012');
  assert.equal(accepted.ownerKey, OWNER);
  assert.equal(accepted.visitorId, body().visitorId);
  assert.equal(accepted.mode, 'local');
  assert.equal(tradePokemonName(25), '피카츄');
});

test('friend-code contacts are twelve digits rather than arbitrary links or strings', () => {
  assert.equal(normalizeTradeContact('friend_code', '1234-5678-9012'), '123456789012');
  for (const value of ['12345678901', '1234567890123', '12345678901x', 'https://example.com', '', null, '123456789012\n']) {
    invalid(() => normalizeTradeContact('friend_code', value));
  }
});

test('Discord contacts accept a bounded handle and reject unrelated URLs or controls', () => {
  assert.equal(normalizeTradeContact('discord', 'trainer.name_01'), 'trainer.name_01');
  for (const value of ['a', 'a'.repeat(33), 'two words', 'trainer/name', 'https://discord.com', '이름', 'user\u0000name']) {
    invalid(() => normalizeTradeContact('discord', value));
  }
});

test('Kakao invitation contacts require the exact HTTPS host and invite path', () => {
  assert.equal(normalizeTradeContact('kakao', 'https://open.kakao.com/o/gTest123'), 'https://open.kakao.com/o/gTest123');
  for (const value of [
    'http://open.kakao.com/o/gTest123', 'https://open.kakao.com.evil.example/o/gTest123',
    'https://evil.example/o/gTest123', 'https://open.kakao.com:8443/o/gTest123',
    'https://user:password@open.kakao.com/o/gTest123', 'https://open.kakao.com/other/gTest123',
    'https://open.kakao.com/o/gTest123/extra', 'javascript:alert(1)',
  ]) invalid(() => normalizeTradeContact('kakao', value));
});

test('offered and wanted Pokemon must be known roster species with explicit shiny flags', () => {
  const valid = validateTradeSubmission(body({ offer: { speciesId: 25, shiny: true, form: '지역 모습' } }));
  assert.deepEqual(valid.offer, { speciesId: 25, shiny: true, form: '지역 모습' });
  for (const pokemon of [
    { speciesId: 999999, shiny: false }, { speciesId: 0, shiny: false }, { speciesId: 25.5, shiny: false },
    { speciesId: '25', shiny: false }, { speciesId: 25, shiny: 'false' }, { speciesId: 25 }, null,
    { speciesId: 25, shiny: false, form: 'x'.repeat(51) }, { speciesId: 25, shiny: false, diagnostic: true },
  ]) {
    invalid(() => validateTradeSubmission(body({ offer: pokemon })));
    invalid(() => validateTradeSubmission(body({ want: pokemon })));
  }
});

test('public contact consent and a 256-bit hexadecimal management capability are mandatory', () => {
  for (const value of [false, undefined, 'true', 1]) invalid(() => validateTradeSubmission(body({ contactPublicConsent: value })));
  assert.equal(validTradeOwnerKey(OWNER), true);
  for (const ownerKey of ['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), body().visitorId, null]) {
    assert.equal(validTradeOwnerKey(ownerKey), false);
    invalid(() => validateTradeSubmission(body({ ownerKey })));
  }
  invalid(() => validateTradeSubmission(body({ visitorId: 'not-a-browser-uuid' })));
});

test('trade mode, region and expiry are explicit bounded selections', () => {
  for (const expiresInDays of [1, 3, 7]) assert.equal(validateTradeSubmission(body({ expiresInDays, mode: 'remote' })).expiresInDays, expiresInDays);
  for (const expiresInDays of [0, 2, 8, 1.5, '3', null]) invalid(() => validateTradeSubmission(body({ expiresInDays })));
  for (const patch of [{ mode: 'all' }, { mode: 'online' }, { cityId: 'unknown-city' }, { contactKind: 'email' }]) {
    invalid(() => validateTradeSubmission(body(patch)));
  }
});

test('public text remains bounded and cannot add undeclared identifying diagnostics', () => {
  const accepted = validateTradeSubmission(body({ notes: '첫째 줄\n둘째 줄\t조건', offer: { speciesId: 25, shiny: false } }));
  assert.equal(accepted.notes, '첫째 줄\n둘째 줄\t조건');
  assert.equal(accepted.offer.form, '');
  for (const patch of [{ trainerName: '' }, { trainerName: 'x'.repeat(41) }, { trainerName: 'name\nother' }, { notes: 'x'.repeat(501) }, { notes: 'text\u0000more' }, { email: 'not-collected@example.com' }]) {
    invalid(() => validateTradeSubmission(body(patch)));
  }
});
