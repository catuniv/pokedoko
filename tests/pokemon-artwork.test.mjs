import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { pokemonArtworkCandidates, nextPokemonArtworkCandidate, pokemonArtworkFallbackLabel } = await importTypeScript('../lib/pokemon-artwork.ts');
const { OFFICIAL_EVENTS } = await importTypeScript('../lib/official-events.ts');
const base = { id: 813, name: 'Scorbunny', image: '' };

test('Scorbunny has bundled artwork and independent remote fallback candidates when image is empty', () => {
  const candidates = pokemonArtworkCandidates(base);
  assert.equal(candidates[0], '/pokemon/813.png');
  assert.ok(candidates.some(url => url.endsWith('/other/official-artwork/813.png')));
  assert.ok(candidates.some(url => url.endsWith('/other/home/813.png')));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('Mega Clefable uses verified form ID 10278 and never base Clefable artwork', () => {
  for (const pokemon of [
    { id: 36, name: 'Mega Clefable', form: 'mega', image: '' },
    { id: 36, name: 'Mega Clefable', image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/36.png' },
  ]) {
    const candidates = pokemonArtworkCandidates(pokemon);
    assert.equal(candidates[0], '/pokemon/10278.png');
    assert.ok(candidates.every(url => !url.endsWith('/36.png')));
  }
});

test('Kyurem forms remain distinct and unknown forms have no ordinary species fallback', () => {
  assert.equal(pokemonArtworkCandidates({ id: 646, name: 'White Kyurem', form: 'white', image: '' })[0], '/pokemon/10023.png');
  assert.equal(pokemonArtworkCandidates({ id: 646, name: 'Black Kyurem', form: 'black', image: '' })[0], '/pokemon/10022.png');
  assert.equal(pokemonArtworkCandidates({ id: 646, name: 'Kyurem (White)', image: '' })[0], '/pokemon/10023.png');
  assert.equal(pokemonArtworkCandidates({ id: 646, name: 'Kyurem (Black)', image: '' })[0], '/pokemon/10022.png');
  assert.equal(pokemonArtworkCandidates({ id: 890, name: 'Eternamax Eternatus', form: 'eternamax', image: '' })[0], '/pokemon/10190.png');
  const unknown = { id: 25, name: 'Pikachu', form: 'sun-crown', image: '' };
  assert.deepEqual(pokemonArtworkCandidates(unknown), []);
  assert.equal(pokemonArtworkFallbackLabel(unknown), '폼 이미지 미등록');
  assert.deepEqual(pokemonArtworkCandidates({ id: 6, name: 'Mega Charizard X', image: '' }), []);
  assert.deepEqual(pokemonArtworkCandidates({ id: 386, name: 'Deoxys (Attack)', image: '' }), []);
  assert.ok(pokemonArtworkCandidates({ id: 386, name: 'Deoxys (Normal)', image: '' }).length > 0);
});

test('retry advances through candidates once, stops at exhaustion and rejects empty or unsafe originals', () => {
  const candidates = pokemonArtworkCandidates({ ...base, image: 'https://example.com/broken.png' });
  assert.equal(candidates[0], 'https://example.com/broken.png');
  let current = candidates[0];
  const visited = [];
  while (current !== null) {
    visited.push(current);
    current = nextPokemonArtworkCandidate(candidates, current);
  }
  assert.deepEqual(visited, candidates);
  assert.equal(nextPokemonArtworkCandidate(candidates, 'not-current'), null);
  assert.ok(pokemonArtworkCandidates({ ...base, image: 'javascript:alert(1)' }).every(url => !url.startsWith('javascript:')));
  assert.deepEqual(pokemonArtworkCandidates({ id: null, name: 'Unknown', image: '  ' }), []);
  assert.deepEqual(pokemonArtworkCandidates({ id: NaN, name: 'Unknown', image: '' }), []);
});

test('all registered official Pokémon have real bundled PNG artwork including Mega Clefable', async () => {
  for (const pokemon of OFFICIAL_EVENTS.flatMap(event => event.pokemon)) {
    assert.ok(pokemon.image.startsWith('/pokemon/'), `${pokemon.name}: bundled source`);
    const bytes = await readFile(new URL(`../public${pokemon.image}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(bytes.length > 1000);
  }
});
