import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = async name => JSON.parse(await readFile(new URL(`../lib/${name}.json`, import.meta.url), 'utf8'));
const base = await data('i18n-messages'), extra = await data('i18n-extra-messages'), pages = await data('i18n-page-messages');
let source = await readFile(new URL('../lib/i18n.ts', import.meta.url), 'utf8');
for (const [binding, file] of [['translations','i18n-messages'],['extraTranslations','i18n-extra-messages'],['pageTranslations','i18n-page-messages'],['pokemonNames','pokemon-names'],['localizedPokemonNames','pokemon-localized-names']]) {
  source = source.replace(`import ${binding} from "./${file}.json";`, `const ${binding} = ${JSON.stringify(await data(file))};`);
}
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText).toString('base64')}`;
const i18nUrl = moduleUrl(source);
const { translateText, readLanguage, persistLanguage, LANGUAGE_STORAGE_KEY, LANGUAGES } = await import(i18nUrl);
let provider = await readFile(new URL('../components/pokedoko/LanguageProvider.tsx', import.meta.url), 'utf8');
provider = provider.replace('from "@/lib/i18n"', `from "${i18nUrl}"`);
const transpiled = ts.transpileModule(provider, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replaceAll('from "react"', `from "${pathToFileURL(require.resolve('react')).href}"`)
  .replaceAll('from "react/jsx-runtime"', `from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`);
const { localizeReactContent } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

test('four languages cover navigation, GPS, contact privacy and Pokemon while preserving unknown source text', () => {
  assert.deepEqual(LANGUAGES, ['ko','en','zh-CN','ja']);
  assert.equal(translateText('실시간 레이드','en'), 'Live raids');
  assert.equal(translateText('이상해씨','en'), 'Bulbasaur');
  assert.equal(translateText('이상해씨','zh-CN'), '妙蛙种子');
  assert.equal(translateText('이상해씨','ja'), 'フシギダネ');
  assert.equal(translateText('Bulbasaur','ja'), 'Bulbasaur');
  assert.equal(translateText('서울의 비밀 산책길','en'), '서울의 비밀 산책길');
  for (const locale of ['en','zh-CN','ja']) {
    for (const text of ['실시간 레이드','교환 모집 글','GPS 위치 변경','상세 주소는 개인 연락처를 교환한 뒤 따로 정해 주세요.']) assert.notEqual(translateText(text,locale), text);
  }
  assert.equal(translateText('로케이션 배경 · My custom event 2026','en'), 'Location background · My custom event 2026');
  assert.equal(translateText('모집 중 12개','en'), '12 open listings');
  assert.equal(translateText('서울 · 대한민국','en'), 'Seoul · South Korea');
  assert.equal(translateText('GPS 위치 변경 · 미지정','en'), 'GPS spoofing · Not specified');
  assert.equal(translateText('GPS 위치 변경 · ','en'), 'GPS spoofing · ');
  assert.equal(translateText('줄 포켓몬: ','en'), 'Offered Pokémon: ');
  for (const locale of ['zh-CN','ja']) assert.doesNotMatch(translateText('GPS 위치 변경 · ',locale),/[가-힣]/u);
});

test('language preference persists safely and defaults to Korean for missing, invalid or blocked storage', () => {
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key,value) => store.set(key,value) };
  assert.equal(readLanguage(storage), 'ko');
  for (const locale of LANGUAGES) { assert.equal(persistLanguage(storage,locale), true); assert.equal(store.get(LANGUAGE_STORAGE_KEY), locale); assert.equal(readLanguage(storage),locale); }
  store.set(LANGUAGE_STORAGE_KEY, 'not-a-language'); assert.equal(readLanguage(storage),'ko');
  assert.equal(readLanguage({getItem(){throw new Error('blocked')}}),'ko');
  assert.equal(persistLanguage({setItem(){throw new Error('blocked')}},'en'),false);
  assert.equal(persistLanguage(undefined,'ja'),false);
});

test('React translation preserves user content and form values including implicit select option values', () => {
  const node = createElement('section', null,
    createElement('h2', null, '실시간 레이드'),
    createElement('p', { 'data-i18n-preserve': true }, '서울'),
    createElement('input', { value:'서울', placeholder:'도시', readOnly:true, 'aria-label':'도시' }),
    createElement('select', {defaultValue:'도시'}, createElement('option',null,'도시')),
    createElement('code',{translate:'no'},'37.5665,126.978'),
  );
  const html = renderToStaticMarkup(localizeReactContent(node,text=>translateText(text,'en')));
  assert.match(html, /<h2>Live raids<\/h2>/);
  assert.match(html, /data-i18n-preserve="true">서울<\/p>/);
  assert.match(html, /value="서울"/); assert.match(html,/placeholder="City"/); assert.match(html,/aria-label="City"/);
  assert.match(html, /<option value="도시" selected="">City<\/option>/);
  assert.match(html, /37\.5665,126\.978/);
});

test('translation records contain three nonempty native-language strings per source key', () => {
  const records = {...base,...extra,...pages};
  assert.ok(Object.keys(records).length >= 972);
  for (const [key,value] of Object.entries(records)) { assert.equal(value.length,3,key); for (const message of value) { assert.equal(typeof message,'string',key); assert.ok(message.trim(),key); assert.doesNotMatch(message,/[가-힣]/u,key); } }
});
