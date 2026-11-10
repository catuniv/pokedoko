import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(relative) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { SITE_ORIGIN, PAGE_SEO, pageMetadata, canonicalUrl, eventPath, buildSitemap, indexableEvent, formatSourceTime, windowStatus, robotsConfig } = await importTypeScript('../lib/site-metadata.ts');
const { OFFICIAL_EVENTS } = await importTypeScript('../lib/official-events.ts');
const { CITIES } = await importTypeScript('../lib/cities.ts');
const { eventWindow } = await importTypeScript('../lib/raid-time.ts');

test('six page metadata entries use distinct Korean titles and fixed canonical/OG/Twitter origins', () => {
  assert.equal(SITE_ORIGIN, 'https://pokedoko.catuniv.workers.dev');
  assert.equal(new Set(Object.values(PAGE_SEO).map(page => page.title)).size, 6);
  for (const page of Object.values(PAGE_SEO)) {
    const metadata = pageMetadata(page);
    assert.equal(metadata.alternates.canonical, `${SITE_ORIGIN}${page.path}`);
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(metadata.openGraph.locale, 'ko_KR');
    assert.equal(metadata.openGraph.type, 'website');
    assert.equal(metadata.openGraph.images[0].url, `${SITE_ORIGIN}/og.png`);
    assert.equal(metadata.openGraph.images[0].width, 1200);
    assert.equal(metadata.openGraph.images[0].height, 630);
    assert.equal(metadata.twitter.card, 'summary_large_image');
    assert.ok(metadata.description.length > 40);
  }
  assert.equal(canonicalUrl('/live?city=seoul#map'), `${SITE_ORIGIN}/live`);
  assert.throws(() => canonicalUrl('https://example.com/live'));
  assert.throws(() => canonicalUrl('//example.com/live'));
});

test('sitemap contains concrete official events and existing cities, capped at 200 total unique URLs', () => {
  const entries = buildSitemap(CITIES, OFFICIAL_EVENTS);
  assert.equal(entries.length, 6 + CITIES.length + OFFICIAL_EVENTS.length);
  assert.equal(CITIES.length, 24);
  for (const city of CITIES) assert.ok(entries.some(entry => entry.url === `${SITE_ORIGIN}/cities/${city.id}`));
  for (const event of OFFICIAL_EVENTS) assert.ok(entries.some(entry => entry.url === `${SITE_ORIGIN}${eventPath(event.id)}`));
  assert.ok(entries.every(entry => entry.lastModified === undefined));
  const many = Array.from({ length: 300 }, (_, index) => ({ ...OFFICIAL_EVENTS[0], id: `confirmed-${index}` }));
  const capped = buildSitemap(CITIES, [...many, many[0]]);
  assert.equal(capped.length, 200);
  assert.equal(new Set(capped.map(entry => entry.url)).size, 200);
  assert.ok(capped.every(entry => new URL(entry.url).origin === SITE_ORIGIN));
});

test('undated, reversed, invalid-calendar and untrusted-source events are never indexed', () => {
  const event = OFFICIAL_EVENTS[0];
  for (const invalid of [
    { ...event, start: null },
    { ...event, id: '' },
    { ...event, start: { value: '2026-02-30T10:00:00', kind: 'local' } },
    { ...event, end: { value: '2026-11-13T10:00:00', kind: 'local' } },
    { ...event, start: { value: '2026-11-14T10:00:00', kind: 'instant' } },
    { ...event, url: 'javascript:alert(1)' },
  ]) assert.equal(indexableEvent(invalid), false);
  assert.equal(buildSitemap([], [{ ...event, start: null }]).length, 6);
  assert.ok(OFFICIAL_EVENTS.every(indexableEvent));
});

test('source formatting keeps wall time separate from instants and ended is half-open', () => {
  assert.equal(formatSourceTime({ kind: 'local', value: '2026-11-14T10:00:00' }), '2026년 11월 14일 10:00');
  assert.match(formatSourceTime({ kind: 'instant', value: '2026-11-14T01:00:00Z' }), /10:00.*한국시간/);
  assert.equal(formatSourceTime({ kind: 'local', value: '2026-02-30T10:00:00' }), '시각 미확인');
  const seoul = CITIES.find(city => city.id === 'seoul');
  const window = eventWindow(OFFICIAL_EVENTS[0], seoul);
  assert.equal(windowStatus(window.start, window.end, new Date('2026-11-14T00:59:59Z')), 'upcoming');
  assert.equal(windowStatus(window.start, window.end, window.start), 'ongoing');
  assert.equal(windowStatus(window.start, window.end, window.end), 'ended');
  assert.equal(windowStatus(window.start, window.end, new Date('2026-12-01T00:00:00Z')), 'ended');
});

test('installed Vinext discovers and serves robots.ts and sitemap.ts metadata routes', async () => {
  const { scanMetadataFiles } = await import('../node_modules/vinext/dist/server/metadata-routes.js');
  const { handleMetadataRouteRequest } = await import('../node_modules/vinext/dist/server/metadata-route-response.js');
  const app = fileURLToPath(new URL('../app', import.meta.url));
  const routes = scanMetadataFiles(app);
  const robots = routes.find(route => route.servedUrl === '/robots.txt');
  const sitemap = routes.find(route => route.servedUrl === '/sitemap.xml');
  assert.equal(path.basename(robots.filePath), 'robots.ts');
  assert.equal(path.basename(sitemap.filePath), 'sitemap.ts');
  const mapped = [
    { ...robots, module: { default: () => robotsConfig() } },
    { ...sitemap, module: { default: async () => buildSitemap(CITIES, OFFICIAL_EVENTS) } },
  ];
  const robotsResponse = await handleMetadataRouteRequest({ metadataRoutes: mapped, cleanPathname: '/robots.txt', makeThenableParams: value => Promise.resolve(value) });
  assert.equal(robotsResponse.status, 200);
  const text = await robotsResponse.text();
  assert.match(text, /Disallow: \/api\//);
  assert.match(text, /Disallow: \/ops/);
  assert.match(text, /Sitemap: https:\/\/pokedoko\.catuniv\.workers\.dev\/sitemap\.xml/);
  const sitemapResponse = await handleMetadataRouteRequest({ metadataRoutes: mapped, cleanPathname: '/sitemap.xml', makeThenableParams: value => Promise.resolve(value) });
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get('Content-Type'), /xml/);
  const xml = await sitemapResponse.text();
  assert.match(xml, /<loc>https:\/\/pokedoko\.catuniv\.workers\.dev\/cities\/seoul<\/loc>/);
  assert.ok(!xml.includes('chatgpt.site'));
});

test('committed brand sharing image is a real 1200×630 PNG', async () => {
  const png = await readFile(new URL('../public/og.png', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length > 10_000);
});
