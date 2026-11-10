import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/growth-client.ts', import.meta.url), 'utf8');
let instance = 0;
async function fresh() {
  const { outputText } = ts.transpileModule(source + `\n// instance ${++instance}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
function browser(options = {}) {
  const names = ['window', 'navigator', 'localStorage', 'location', 'fetch'];
  const descriptors = new Map(names.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map(), calls = [];
  const state = {
    window: new EventTarget(),
    navigator: { doNotTrack: options.dnt ?? null, globalPrivacyControl: options.gpc ?? false },
    location: { search: options.search ?? '?from=dc&query=private+search&lat=37.5' },
    localStorage: {
      getItem(key) { if (options.blockStorage) throw new Error('blocked'); return values.get(key) ?? null; },
      setItem(key, value) { if (options.blockStorage || options.blockWrites) throw new Error('blocked'); values.set(key, value); },
      removeItem(key) { if (options.blockStorage) throw new Error('blocked'); values.delete(key); },
    },
    fetch: async (...args) => { calls.push(args); if (options.failFetch) throw new Error('offline'); return new Response('{}', { status: 202 }); },
  };
  for (const [key, value] of Object.entries(state)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return { values, calls, restore() { for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}

test('campaigns normalize to a closed set without storing arbitrary referrer strings', async () => {
  const client = await fresh();
  assert.equal(client.campaignSource('?from=dc'), 'dc');
  assert.equal(client.campaignSource('?utm_source=Kakaotalk&email=private@example.com'), 'kakao');
  assert.equal(client.campaignSource('?from=https://private.example/a'), 'other');
  assert.equal(client.campaignSource(''), 'direct');
  assert.equal(client.usageViewForPath('/cities/tokyo'), 'city');
  assert.equal(client.usageViewForPath('/events/announced-event'), 'event');
  assert.equal(client.usageViewForPath('/privacy'), null);
  assert.equal(client.usageViewForPath('/api/feedback'), null);
});

test('visitor records expire at thirty days and reject future dates, malformed IDs and arbitrary sources', async () => {
  const { validStoredVisitor } = await fresh();
  const now = Date.now(), base = { id: '123e4567-e89b-42d3-a456-426614174000', createdAt: now, source: 'dc' };
  assert.equal(validStoredVisitor(base, now), true);
  assert.equal(validStoredVisitor({ ...base, createdAt: now - 30 * 86400000 }, now), false);
  assert.equal(validStoredVisitor({ ...base, createdAt: now + 61000 }, now), false);
  assert.equal(validStoredVisitor({ ...base, id: 'not-a-uuid' }, now), false);
  assert.equal(validStoredVisitor({ ...base, source: 'raw-personal-source' }, now), false);
});

test('DNT and GPC prevent automatic identifiers and network events', async () => {
  for (const setting of [{ dnt: '1' }, { gpc: true }]) {
    const fake = browser(setting);
    try {
      const c = await fresh(); c.initializeUsage();
      assert.equal(c.usageAllowed(), false);
      assert.equal(await c.sendUsage({ event: 'page_view', view: 'live' }), false);
      assert.equal(fake.values.size, 0); assert.equal(fake.calls.length, 0);
      assert.match(c.feedbackVisitorId(), /^[0-9a-f-]{36}$/i);
      assert.equal(fake.values.size, 0);
    } finally { fake.restore(); }
  }
});

test('successful events contain only the explicit payload and duplicates do not affect UI actions', async () => {
  const fake = browser();
  try {
    const c = await fresh(); c.initializeUsage();
    assert.equal(await c.sendUsage({ event: 'coordinate_copy', view: 'live', city: 'tokyo', lat: 35.1, query: 'private search' }), true);
    assert.equal(await c.sendUsage({ event: 'coordinate_copy', view: 'live', city: 'tokyo' }), false);
    assert.equal(fake.calls.length, 1);
    const body = JSON.parse(fake.calls[0][1].body);
    assert.equal(fake.calls[0][1].referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(body).sort(), ['city', 'event', 'source', 'view', 'visitorId']);
    assert.equal(body.source, 'dc'); assert.equal(body.city, 'tokyo');
    assert.equal(JSON.stringify(body).includes('private'), false);
    c.setUsageAllowed(false);
    assert.equal(fake.values.has('pokedoko.usage.visitor.v1'), false);
    assert.equal(await c.sendUsage({ event: 'share', view: 'live' }), false);
    assert.equal(fake.calls.length, 1);
  } finally { fake.restore(); }
});

test('opt-out remains effective with blocked storage and offline telemetry never throws', async () => {
  const fake = browser({ blockStorage: true, failFetch: true });
  try {
    const c = await fresh();
    assert.equal(await c.sendUsage({ event: 'page_view', view: 'calendar' }), false);
    c.setUsageAllowed(false);
    assert.equal(c.usageAllowed(), false);
    await c.sendUsage({ event: 'share', view: 'calendar' });
    assert.equal(fake.calls.length, 1);
  } finally { fake.restore(); }
});

test('an explicit opt-out beats a stale saved true when writes alone fail, and still removes the visitor', async () => {
  const fake = browser({ blockWrites: true });
  try {
    fake.values.set('pokedoko.usage.enabled', 'true');
    fake.values.set('pokedoko.usage.visitor.v1', 'stale-visitor');
    const c = await fresh();
    assert.equal(c.setUsageAllowed(false), false);
    assert.equal(c.usageAllowed(), false);
    assert.equal(fake.values.has('pokedoko.usage.visitor.v1'), false);
    assert.equal(await c.sendUsage({ event: 'page_view', view: 'live' }), false);
    assert.equal(fake.calls.length, 0);
    // A deliberate change in another tab can update a saved preference.
    fake.values.set('pokedoko.usage.enabled', 'false'); c.syncUsagePreference();
    assert.equal(c.usageAllowed(), false);
  } finally { fake.restore(); }
});
