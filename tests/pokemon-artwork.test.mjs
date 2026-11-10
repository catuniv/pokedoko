import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(path) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [name, file] of [['catalog', 'pokemon-go-sprites.json'], ['localImages', 'pokemon-go-local.json']]) {
    const data = JSON.parse(await readFile(new URL(`../lib/${file}`, import.meta.url), 'utf8'));
    source = source.replace(`import ${name} from "./${file}";`, `const ${name} = ${JSON.stringify(data)};`);
  }
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { pokemonArtworkCandidates, nextPokemonArtworkCandidate, pokemonArtworkFallbackLabel } = await importTypeScript('../lib/pokemon-artwork.ts');
const { OFFICIAL_EVENTS } = await importTypeScript('../lib/official-events.ts');
const catalog = JSON.parse(await readFile(new URL('../lib/pokemon-go-sprites.json', import.meta.url), 'utf8'));
const local = JSON.parse(await readFile(new URL('../lib/pokemon-go-local.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('../lib/feed-snapshot.json', import.meta.url), 'utf8'));
const base = { id: 813, name: 'Scorbunny', image: '' };
const remote = file => catalog.baseUrl + file.split('/').map(encodeURIComponent).join('/');
const ends = (pokemon, file, appearance) => {
  const candidates = pokemonArtworkCandidates(pokemon, appearance);
  assert.ok(candidates.includes(remote(file)), `${pokemon.name}: ${file}`);
  assert.ok(candidates.every(url => !/PokeAPI|official-artwork|\/other\/home\//i.test(url)));
  return candidates;
};

test('ordinary Pokémon use bundled game sprites and a pinned original fallback', () => {
  const candidates = ends(base, 'Addressable Assets/pm813.icon.png');
  assert.equal(candidates[0], '/pokemon-go/pm813.icon.png');
  assert.equal(candidates.at(-1), remote('Addressable Assets/pm813.icon.png'));
  assert.equal(new Set(candidates).size, candidates.length);
  ends({ id: 102, name: 'Exeggcute', image: '' }, 'Addressable Assets/pm102.icon.png');
});

test('a missing Mega Clefable sprite remains unavailable rather than showing base Clefable', () => {
  for (const pokemon of [
    { id: 36, name: 'Mega Clefable', form: 'mega', image: '' },
    { id: 36, name: 'Mega Clefable', image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/36.png' },
    { id: 36, name: 'Mega Clefable', form: 'mega', image: '/pokemon-go/pm36.icon.png' },
  ]) assert.deepEqual(pokemonArtworkCandidates(pokemon), []);
});

test('Kyurem forms, Mega X/Y, regional forms, crowned and Deoxys forms keep their identities', () => {
  for (const [id, name, form, file] of [
    [646, 'White Kyurem', 'white', 'pm646.fWHITE.icon.png'],
    [646, 'Kyurem (Black)', undefined, 'pm646.fBLACK.icon.png'],
    [646, '큐레무', '화이트', 'pm646.fWHITE.icon.png'],
    [890, 'Eternamax Eternatus', undefined, 'pm890.fETERNAMAX.icon.png'],
    [6, 'Mega Charizard X', undefined, 'pm6.fMEGA_X.icon.png'],
    [6, 'Charizard', 'mega-y', 'pm6.fMEGA_Y.icon.png'],
    [52, 'Meowth', 'Alolan', 'pm52.fALOLA.icon.png'],
    [52, '나옹', '가라르', 'pm52.fGALARIAN.icon.png'],
    [58, 'Hisuian Growlithe', undefined, 'pm58.fHISUIAN.icon.png'],
    [194, 'Wooper', 'Paldean', 'pm194.fPALDEA.icon.png'],
    [888, 'Zacian (Crowned Sword)', undefined, 'pm888.fCROWNED_SWORD.icon.png'],
    [889, 'Zamazenta', '방패왕', 'pm889.fCROWNED_SHIELD.icon.png'],
    [386, 'Deoxys (Attack)', undefined, 'pm386.fATTACK.icon.png'],
    [386, 'Deoxys (Defense)', undefined, 'pm386.fDEFENSE.icon.png'],
    [386, 'Deoxys', '스피드', 'pm386.fSPEED.icon.png'],
    [487, 'Giratina (Origin Forme)', undefined, 'pm487.fORIGIN.icon.png'],
    [94, 'Gigantamax Gengar', undefined, 'pm94.fGIGANTAMAX.icon.png'],
  ]) ends({ id, name, form, image: '' }, `Addressable Assets/${file}`);
  assert.deepEqual(pokemonArtworkCandidates({ id: 6, name: 'Mega Charizard', image: '' }), []);
});

test('unknown or unreleased forms and arbitrary costumes never fall back to normal sprites', () => {
  for (const form of ['sun-crown', 'Party Hat', 'Flower Crown', '<script>alert(1)</script>']) {
    const pokemon = { id: 25, name: 'Pikachu', form, image: '/pokemon-go/pm25.icon.png' };
    assert.deepEqual(pokemonArtworkCandidates(pokemon), []);
    assert.equal(pokemonArtworkFallbackLabel(pokemon), '폼 이미지 미등록');
  }
  assert.deepEqual(pokemonArtworkCandidates({ id: 10278, name: 'Mega Clefable', image: '' }), []);
  assert.deepEqual(pokemonArtworkCandidates({ id: 1025, name: 'Pecharunt', image: '' }), []);
});

test('feed shiny availability does not change appearance; explicit trade shiny does', () => {
  ends({ ...base, shiny: true }, 'Addressable Assets/pm813.icon.png');
  ends({ ...base, shiny: false }, 'Addressable Assets/pm813.s.icon.png', { shiny: true });
  ends({ ...base, image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm813.s.icon.png' }, 'Addressable Assets/pm813.s.icon.png');
  ends({ ...base, image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm813.s.icon.png' }, 'Addressable Assets/pm813.icon.png', { shiny: false });
  ends({ id: 646, name: 'White Kyurem', form: 'white', image: '' }, 'Addressable Assets/pm646.fWHITE.s.icon.png', { shiny: true });
  ends({ id: 25, name: 'Pikachu', form: 'ANNIVERSARY_2026_TAIWAN_01', image: '' }, 'Addressable Assets/pm25.fANNIVERSARY_2026_TAIWAN_01.s.icon.png', { shiny: true });
  assert.deepEqual(pokemonArtworkCandidates({ id: 891, name: 'Kubfu', image: '' }, { shiny: true }), []);
});

test('a verified exact costume source survives a human label without using a normal image', () => {
  const pokemon = { id: 25, name: 'Pikachu (pink cotton candy)', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.fANNIVERSARY_2026_TAIWAN_01.icon.png' };
  ends(pokemon, 'Addressable Assets/pm25.fANNIVERSARY_2026_TAIWAN_01.icon.png');
  ends(pokemon, 'Addressable Assets/pm25.fANNIVERSARY_2026_TAIWAN_01.s.icon.png', { shiny: true });
  assert.deepEqual(pokemonArtworkCandidates({ ...pokemon, image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.icon.png' }), []);
  ends({ id: 3, name: 'Venusaur (female)', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm3.g2.icon.png' }, 'Addressable Assets/pm3.g2.icon.png');
});

test('an explicit form rejects a conflicting ordinary source image', () => {
  const candidates = ends({ id: 6, name: 'Charizard', form: 'mega-x', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm6.icon.png' }, 'Addressable Assets/pm6.fMEGA_X.icon.png');
  assert.ok(!candidates.some(url => url.endsWith('/pm6.icon.png')));
  const mismatch = ends({ ...base, image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.icon.png' }, 'Addressable Assets/pm813.icon.png');
  assert.ok(!mismatch.some(url => url.endsWith('/pm25.icon.png')));
});

test('all 46 current feed icon identities resolve to the exact verified original filename', () => {
  const unique = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.image === 'string' && value.image.includes('/pokemon_icons/')) {
      const basename = decodeURIComponent(new URL(value.image).pathname.split('/').at(-1));
      const file = catalog.files.find(file => file.split('/').at(-1) === basename);
      assert.ok(file, `${value.name}: original file exists`);
      const id = Number(basename.match(/^(?:pm|pokemon_icon_)(\d+)/)[1]);
      const candidates = pokemonArtworkCandidates({ id, name: value.name, image: value.image, shiny: value.canBeShiny });
      assert.ok(candidates.includes(remote(file)), `${value.name}: preserves ${basename}`);
      unique.add(`${value.name}:${basename}`);
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
  }
  walk(snapshot);
  assert.equal(unique.size, 46);
});

test('retry preserves sprite identity, stops at exhaustion and rejects unsupported inputs', () => {
  const candidates = pokemonArtworkCandidates({ ...base, image: 'https://example.com/broken.png' });
  let current = candidates[0];
  const visited = [];
  while (current !== null) { visited.push(current); current = nextPokemonArtworkCandidate(candidates, current); }
  assert.deepEqual(visited, candidates);
  assert.equal(nextPokemonArtworkCandidate(candidates, 'not-current'), null);
  assert.ok(pokemonArtworkCandidates({ ...base, image: 'javascript:alert(1)' }).every(url => !url.startsWith('javascript:')));
  assert.deepEqual(pokemonArtworkCandidates({ id: null, name: 'Unknown', image: '  ' }), []);
  assert.deepEqual(pokemonArtworkCandidates({ id: NaN, name: 'Unknown', image: '' }), []);
});

test('registered official Pokémon use bundled verified game PNGs and known missing Mega Clefable stays empty', async () => {
  for (const pokemon of OFFICIAL_EVENTS.flatMap(event => event.pokemon)) {
    if (pokemon.id === 36 && pokemon.form === 'mega') {
      assert.equal(pokemon.image, '');
      assert.deepEqual(pokemonArtworkCandidates(pokemon), []);
      continue;
    }
    assert.ok(pokemon.image.startsWith('/pokemon-go/'), `${pokemon.name}: bundled GO source`);
    assert.ok(Object.values(local).includes(pokemon.image), `${pokemon.name}: provenance manifest`);
    const bytes = await readFile(new URL(`../public${pokemon.image}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(bytes.length > 1000);
  }
});
