import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const names = JSON.parse(await readFile(new URL('../lib/pokemon-names.json', import.meta.url), 'utf8'));
const localizedNames = JSON.parse(await readFile(new URL('../lib/pokemon-localized-names.json', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../lib/trade-pokemon-search.ts', import.meta.url), 'utf8'))
  .replace('import names from "./pokemon-names.json";', `const names = ${JSON.stringify(names)};`)
  .replace('import localizedNames from "./pokemon-localized-names.json";', `const localizedNames = ${JSON.stringify(localizedNames)};`);
const runtime = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { searchTradeSpecies, tradeSpeciesName } = await import(`data:text/javascript;base64,${Buffer.from(runtime).toString('base64')}`);

test('Korean, English and dex-number searches return the same English display name', () => {
  for (const query of ['이상해씨', ' 이상해씨 ', 'bulbasaur', 'BULBASAUR', '#1']) {
    const found = searchTradeSpecies(query)[0];
    assert.equal(found.id, 1); assert.equal(found.en, 'Bulbasaur');
    assert.equal(tradeSpeciesName(found.id), 'Bulbasaur');
  }
  assert.equal(searchTradeSpecies('피카츄')[0].en, 'Pikachu');
  assert.equal(searchTradeSpecies('Mr. Mime')[0].en, 'Mr. Mime');
  assert.equal(searchTradeSpecies('Mr.Mime')[0].en, 'Mr. Mime');
  assert.equal(searchTradeSpecies('찾을수없는포켓몬').length, 0);
});

test('searches stay bounded without changing names used elsewhere in the Korean site', () => {
  assert.equal(searchTradeSpecies('').length, 12);
  assert.equal(searchTradeSpecies('', 500).length, 50);
  assert.equal(searchTradeSpecies('', 0).length, 0);
  assert.equal(names['1'].ko, '이상해씨');
  assert.equal(tradeSpeciesName(999999), '#999999');
});

test('Japanese, Simplified and Traditional Chinese searches keep English trade identities', () => {
  for (const query of ['フシギダネ', '妙蛙种子', '妙蛙種子']) {
    assert.equal(searchTradeSpecies(query)[0].id, 1);
    assert.equal(searchTradeSpecies(query)[0].en, 'Bulbasaur');
  }
});
