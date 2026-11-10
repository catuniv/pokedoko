import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMinimumRaidTime } from '../lib/live-raid-display.ts';
const now = new Date('2026-11-10T03:00:00Z');
const raid = remaining => ({ endsAt: new Date(now.getTime() + remaining).toISOString() });

test('only raids with at least five minutes remaining meet the display threshold', () => {
  assert.equal(hasMinimumRaidTime(raid(1000), now), false);
  assert.equal(hasMinimumRaidTime(raid(299999), now), false);
  assert.equal(hasMinimumRaidTime(raid(300000), now), true);
  assert.equal(hasMinimumRaidTime(raid(300001), now), true);
});

test('a visible raid disappears when the clock passes below five minutes', () => {
  const entry = raid(300000);
  assert.equal(hasMinimumRaidTime(entry, now), true);
  assert.equal(hasMinimumRaidTime(entry, new Date(now.getTime() + 1)), false);
  assert.equal(hasMinimumRaidTime(raid(-1), now), false);
  assert.equal(hasMinimumRaidTime({ endsAt: 'invalid' }, now), false);
});
