import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const manifest = await json('../lib/pokemon-go-local-manifest.json');
const local = await json('../lib/pokemon-go-local.json');
const catalog = await json('../lib/pokemon-go-sprites.json');

test('bundled GO sprites preserve verified original bytes, dimensions and local manifest identity', async () => {
  const files = new Set(catalog.files);
  assert.equal(manifest.commit, catalog.commit);
  assert.equal(Object.keys(local).length, manifest.assets.length);
  for (const asset of manifest.assets) {
    assert.ok(files.has(asset.sourcePath), asset.sourcePath);
    assert.equal(local[asset.sourcePath], `/pokemon-go/${asset.file}`);
    const bytes = await readFile(new URL(`../public${local[asset.sourcePath]}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 256);
    assert.equal(bytes.readUInt32BE(20), 256);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), asset.gitBlobSha);
    assert.equal(asset.sourceUrl, catalog.baseUrl + asset.sourcePath.split('/').map(encodeURIComponent).join('/'));
  }
});

test('Mega Clefable official event banner remains original JPEG rather than a substituted species icon', async () => {
  const asset = await json('../lib/pokemon-go-event-assets.json');
  assert.equal(asset.alpha, false);
  assert.equal(asset.width, 1920);
  assert.equal(asset.height, 1080);
  const bytes = await readFile(new URL(`../public/pokemon-go-events/${asset.file}`, import.meta.url));
  assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255]);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
});
