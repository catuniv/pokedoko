import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_FEED, normalizeBosses, normalizeEvents } from '../lib/feed.ts';

const event = { eventID: 'fixture', name: 'Fixture', eventType: 'raid-hour', start: '2026-11-18T18:00:00.000', end: '2026-11-18T19:00:00.000', extraData: null };

test('keeps local wall times distinct from absolute UTC instants', () => {
  const rows = normalizeEvents([event, { ...event, eventID: 'utc', start: `${event.start}Z`, end: `${event.end}Z` }]);
  assert.equal(rows.find(e => e.id === 'fixture').start.kind, 'local');
  assert.equal(rows.find(e => e.id === 'utc').start.kind, 'instant');
  assert.equal(rows.find(e => e.id === 'fixture').start.value, event.start);
});

test('rejects null, rollover and reversed dates and keeps stable unique IDs', () => {
  const rows = normalizeEvents([event, event, { ...event, eventID: 'null', start: null }, { ...event, eventID: 'bad', start: '2026-02-30T18:00:00' }, { ...event, eventID: 'reversed', end: event.start }]);
  assert.equal(rows.filter(e => e.id === 'fixture').length, 1);
  assert.equal(rows.some(e => ['null', 'bad', 'reversed'].includes(e.id)), false);
});

test('adds official exceptional raid hours without inventing Wednesday recurrence', () => {
  const hours = normalizeEvents([]);
  assert.deepEqual(hours.map(e => e.start.value.slice(0, 10)), ['2026-11-09', '2026-11-10']);
  const zamazenta = hours.find(e => e.id === 'official-raid-hour-2026-11-10');
  assert.equal(zamazenta.url, 'https://pokemongo.com/news/into-the-wild-2026');
  assert.equal(zamazenta.pokemon[0].id, 889);
});

test('extracts multiple spotlight encounters, deduplicates and preserves form artwork', () => {
  const p = { name: 'Zamazenta (Crowned Shield)', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm889.fCROWNED_SHIELD.icon.png' };
  const rows = normalizeEvents([{ ...event, extraData: { spotlight: { ...p, list: [p] } } }]);
  assert.equal(rows.find(e => e.id === 'fixture').pokemon.length, 1);
  assert.equal(rows.find(e => e.id === 'fixture').pokemon[0].nameKo, '자마젠타 · 방패왕');
});

test('confirms a dated boss window instead of treating a retrieved list as always current', () => {
  const raw = [{ name: 'Orthworm', tier: '3-Star Raids', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm968.icon.png' }];
  assert.equal(normalizeBosses(raw, [], new Date('2026-11-10T00:00:00Z'))[0].confirmedWindow, true);
  assert.equal(normalizeBosses(raw, [], new Date('2027-01-10T00:00:00Z'))[0].confirmedWindow, false);
  assert.equal(normalizeBosses(raw)[0].nameKo, '꿈트렁');
});

test('network failure never throws or assigns a fresh time to the saved snapshot', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const { loadFeed } = await import('../lib/feed.ts?failure');
    const result = await loadFeed();
    assert.equal(result.cached, true);
    assert.equal(result.fetchedAt, FALLBACK_FEED.fetchedAt);
    assert.ok(result.error);
    assert.ok(result.events.length > 2);
  } finally { globalThis.fetch = original; }
});

test('a partial outage preserves the older timestamp and caches requests for five minutes', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async url => {
      requests++;
      if (String(url).includes('raids.min.json')) throw new Error('raid source unavailable');
      return Response.json([event]);
    };
    const { loadFeed } = await import('../lib/feed.ts?partial');
    const first = await loadFeed();
    assert.equal(first.events.some(e => e.id === 'fixture'), true);
    assert.equal(first.cached, true);
    assert.equal(first.fetchedAt, FALLBACK_FEED.fetchedAt);
    assert.ok(first.bosses.length);
    await loadFeed();
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test('malformed successful HTTP payloads use the saved data', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json([{ unknown: true }]);
    const { loadFeed } = await import('../lib/feed.ts?malformed');
    const result = await loadFeed();
    assert.equal(result.cached, true);
    assert.equal(result.fetchedAt, FALLBACK_FEED.fetchedAt);
    assert.ok(result.bosses.length);
    assert.ok(result.error);
  } finally { globalThis.fetch = original; }
});
