import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const citiesUrl = moduleUrl(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const cellRoutesUrl = moduleUrl(await readFile(new URL('../lib/cell-routes.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../lib/community-routes.ts', import.meta.url), 'utf8'))
  .replace(/from (["'])\.\/cities\1/g, `from '${citiesUrl}'`)
  .replace(/from (["'])\.\/cell-routes\1/g, `from '${cellRoutesUrl}'`);
const { validateCommunityGeometry, validateCommunitySubmission, CommunityRouteValidationError, communityRouteGpx, communityGpxFilename } = await import(moduleUrl(source));

const NOW = new Date('2026-11-10T03:00:00Z');
const point = (lat, lon) => ({ lat, lon });
const A = point(37.5665, 126.978);
const B = point(37.5675, 126.978);
const C = point(37.5675, 126.98);
const D = point(37.5665, 126.98);
const points = () => [A, B, C, D, A].map(value => ({ ...value }));
const submission = (patch = {}) => ({
  visitorId: '550e8400-e29b-41d4-a716-446655440000',
  name: '서울 시청 주변 테스트 Route', cityId: 'seoul',
  startName: '시청 앞 시작 포켓스톱', endName: '시청 앞 종료 포켓스톱',
  startPoint: { ...A }, endPoint: { ...A }, reportedDistanceMeters: 575,
  creatorName: '경로 제작자', rightsBasis: 'creator', rightsDetails: '직접 기록한 경로입니다.',
  allowRedistribution: true, inGameConfirmed: true, lastCheckedAt: '2026-11-10',
  geometryType: 'original', points: points(), notes: '게임에서 직접 확인한 코스입니다.',
  ...patch,
});
const invalid = callback => assert.throws(callback, CommunityRouteValidationError);

test('community geometry preserves original precision, point order and nonconsecutive revisits', () => {
  const precise = point(37.5665123456789, 126.9780123456789);
  const input = [precise, { ...B }, { ...C }, { ...B }, precise].map(Object.freeze);
  Object.freeze(input);
  const before = JSON.stringify(input);
  const result = validateCommunityGeometry(input, 575);
  assert.deepEqual(result.points, input);
  assert.equal(result.pointCount, input.length);
  assert.equal(JSON.stringify(input), before);
  assert.ok(result.computedDistanceMeters > 565 && result.computedDistanceMeters < 585);
});

test('community geometry rejects invalid coordinates and single-point paths', () => {
  for (const malformed of [
    [A], [], [{ lat: NaN, lon: 126.978 }, B], [{ lat: Infinity, lon: 126.978 }, B],
    [{ lat: 91, lon: 126.978 }, B], [{ lat: 37.5, lon: 181 }, B],
    [{ lat: '37.5665', lon: 126.978 }, B], [null, B],
  ]) invalid(() => validateCommunityGeometry(malformed, 575));
  invalid(() => validateCommunityGeometry(Array.from({ length: 2001 }, (_, index) => index % 2 ? B : A), 100000));
});

test('community geometry cannot connect separate countries or skip a long segment', () => {
  invalid(() => validateCommunityGeometry([A, point(35.68088, 139.80078)], 100000));
  // A northward step of about 505m exceeds the 500m per-segment bound.
  invalid(() => validateCommunityGeometry([A, point(37.571041568, 126.978)], 505));
  assert.equal(validateCommunityGeometry([A, point(37.570951635, 126.978)], 495).pointCount, 2);
});

test('community distance comparison uses both the 100m tolerance and the ten-percent limit', () => {
  assert.ok(validateCommunityGeometry(points(), 670).computedDistanceMeters > 570);
  invalid(() => validateCommunityGeometry(points(), 680));
  invalid(() => validateCommunityGeometry(points(), 400));
  const long = Array.from({ length: 11 }, (_, index) => point(0, index * .002));
  assert.ok(validateCommunityGeometry(long, 2470).computedDistanceMeters > 2200);
  invalid(() => validateCommunityGeometry(long, 2500));
  for (const distance of [99, 100001, 0, -1, NaN, Infinity, '575']) invalid(() => validateCommunityGeometry(points(), distance));
});

test('provided start and end positions must match the actual geometry endpoints', () => {
  assert.equal(validateCommunityGeometry(points(), 575, A, A).pointCount, 5);
  invalid(() => validateCommunityGeometry(points(), 575, C, A));
  invalid(() => validateCommunityGeometry(points(), 575, A, C));
  invalid(() => validateCommunityGeometry(points(), 575, point(91, 0), A));
});

test('community submission requires explicit game confirmation and redistribution consent', () => {
  const accepted = validateCommunitySubmission(submission(), NOW);
  assert.equal(accepted.geometryType, 'original');
  assert.deepEqual(accepted.points, points());
  for (const value of [false, undefined, 'true', 1]) {
    invalid(() => validateCommunitySubmission(submission({ allowRedistribution: value }), NOW));
    invalid(() => validateCommunitySubmission(submission({ inGameConfirmed: value }), NOW));
  }
});

test('a metadata-only actual Route cannot manufacture GPX from its start marker', () => {
  const input = submission({ geometryType: 'none', points: undefined, endName: '', endPoint: undefined });
  const accepted = validateCommunitySubmission(input, NOW);
  assert.equal(accepted.geometryType, 'none');
  assert.ok(!accepted.points || accepted.points.length === 0);
  invalid(() => validateCommunitySubmission(submission({ geometryType: 'none' }), NOW));
  invalid(() => validateCommunitySubmission(submission({ geometryType: 'original', points: undefined }), NOW));
});

test('estimated and reconstructed submissions keep their provenance rather than becoming original paths', () => {
  for (const geometryType of ['estimated', 'reconstructed']) {
    const accepted = validateCommunitySubmission(submission({ geometryType }), NOW);
    assert.equal(accepted.geometryType, geometryType);
  }
  invalid(() => validateCommunitySubmission(submission({ geometryType: 'verified' }), NOW));
});

test('permission and license submissions require a public source and descriptive rights evidence', () => {
  for (const rightsBasis of ['permission', 'license']) {
    const valid = { rightsBasis, rightsDetails: '원래 제작자에게 경로의 공개 재배포와 GPX 제공을 허락받았습니다.', sourceUrl: 'https://example.com/routes/permission' };
    assert.equal(validateCommunitySubmission(submission(valid), NOW).rightsBasis, rightsBasis);
    invalid(() => validateCommunitySubmission(submission({ ...valid, sourceUrl: undefined }), NOW));
    invalid(() => validateCommunitySubmission(submission({ ...valid, rightsDetails: '공개됨' }), NOW));
  }
  for (const sourceUrl of ['javascript:alert(1)', 'http://example.com/route', 'https://user:pass@example.com/route']) {
    invalid(() => validateCommunitySubmission(submission({ sourceUrl }), NOW));
  }
  invalid(() => validateCommunitySubmission(submission({ rightsBasis: 'public' }), NOW));
});

test('route confirmation dates are actual calendar dates no later than the review day', () => {
  assert.equal(validateCommunitySubmission(submission({ lastCheckedAt: '2024-02-29' }), NOW).lastCheckedAt, '2024-02-29');
  for (const lastCheckedAt of ['2026-02-30', '2025-02-29', '2026-11-11', '2026-1-1', '', '2026-11-10T00:00:00Z']) {
    invalid(() => validateCommunitySubmission(submission({ lastCheckedAt }), NOW));
  }
});

test('a confirmation date uses the selected city day rather than the server UTC day', () => {
  const now = new Date('2026-11-10T15:30:00Z');
  assert.equal(validateCommunitySubmission(submission({ lastCheckedAt: '2026-11-11' }), now).lastCheckedAt, '2026-11-11');
  const ny = { cityId: 'new-york', startPoint: point(40.7128, -74.006), endPoint: undefined, endName: '', geometryType: 'none', points: undefined };
  assert.equal(validateCommunitySubmission(submission({ ...ny, lastCheckedAt: '2026-11-10' }), now).lastCheckedAt, '2026-11-10');
  invalid(() => validateCommunitySubmission(submission({ ...ny, lastCheckedAt: '2026-11-11' }), now));
});

test('a city label cannot place another country route into that city public list', () => {
  invalid(() => validateCommunitySubmission(submission({ cityId: 'tokyo' }), NOW));
  const tokyoStart = point(35.68088, 139.80078);
  assert.equal(validateCommunitySubmission(submission({ cityId: 'tokyo', geometryType: 'none', points: undefined, startPoint: tokyoStart, endPoint: undefined }), NOW).cityId, 'tokyo');
});

test('community records reject unknown city, malformed identity and empty location metadata', () => {
  for (const patch of [{ cityId: 'unknown-city' }, { visitorId: 'not-a-uuid' }, { name: '' }, { startName: '' }, { creatorName: '' }]) {
    invalid(() => validateCommunitySubmission(submission(patch), NOW));
  }
});

test('a downloadable community GPX contains the whole original track once, preserving order and provenance', () => {
  const route = { ...submission(), id: '550e8400-e29b-41d4-a716-446655440001', gpxAvailable: true,
    verificationStatus: 'needs_verification', name: '서울 & <경로>', geometryType: 'estimated', sourceUrl: 'https://example.com/route?a=1&b=2' };
  const xml = communityRouteGpx(route);
  assert.equal((xml.match(/<trk>/g) ?? []).length, 1);
  assert.equal((xml.match(/<trkpt /g) ?? []).length, points().length);
  const exported = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map(match => point(Number(match[1]), Number(match[2])));
  assert.deepEqual(exported, points());
  assert.ok(xml.includes('서울 &amp; &lt;경로&gt;'));
  assert.ok(xml.includes('a=1&amp;b=2'));
  assert.ok(xml.includes('<pokedoko:geometryType>estimated</pokedoko:geometryType>'));
  assert.ok(xml.includes('<pokedoko:verificationStatus>needs_verification</pokedoko:verificationStatus>'));
  assert.equal(xml.includes('<time>'), false);
  invalid(() => communityRouteGpx({ ...route, gpxAvailable: false }));
  invalid(() => communityRouteGpx({ ...route, geometryType: 'none' }));
});

test('GPX coordinates use decimal notation even near zero and filenames cannot inject path components', () => {
  const nearZero = [point(1e-7, 126.978), point(.0010001, 126.978)];
  const route = { ...submission({ points: nearZero, startPoint: nearZero[0], endPoint: nearZero[1], reportedDistanceMeters: 111.2 }),
    id: '550e8400-e29b-41d4-a716-446655440001', gpxAvailable: true, verificationStatus: 'reviewed' };
  const xml = communityRouteGpx(route);
  assert.ok(xml.includes('lat="0.0000001"'));
  assert.equal(/(?:lat|lon)="[^"]*[eE][+-]?\d/.test(xml), false);
  const filename = communityGpxFilename({ cityId: 'seoul', name: '../../서울/경로\\파일', geometryType: 'reconstructed' });
  assert.ok(filename.startsWith('seoul_route_'));
  assert.ok(filename.endsWith('_reconstructed.gpx'));
  assert.equal(/[\\/\r\n]/.test(filename), false);
});
