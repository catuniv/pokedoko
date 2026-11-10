/** Server module. Import the public types, rather than this module, from client pages. */
import { CITIES } from './cities';
import { collectPublicRaidMaps } from './raid-map-sources';
import pokemonNames from './pokemon-names.json' with { type: 'json' };
import type { LiveRaid, LiveRaidFeed, LiveRaidStatus } from './live-raid-types';
import type { CollectedRaidMaps } from './raid-map-sources';

export const MAX_OBSERVATION_AGE_MS = 10 * 60_000;
const MAX_BYTES = 1_048_576, MAX_RAIDS = 15000, CLOCK_SKEW_MS = 60_000;
const CITY_IDS = new Set(CITIES.map(city => city.id));
type Obj = Record<string, unknown>;
type Env = { POKEDOKO_RAID_FEED_URL?: string; POKEDOKO_RAID_FEED_TOKEN?: string; POKEDOKO_RAID_MAPS_ENABLED?: string };
type Options = { env?: Env; fetcher?: typeof fetch; now?: Date; mapCollector?: () => Promise<CollectedRaidMaps> };
const record = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const text = (value: unknown, limit: number): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const catalog: Record<string, { ko?: string; en?: string }> = pokemonNames;
function raidName(pokemonId: number | null, formId: number | null, tier: number | null): string | null {
  if (!pokemonId) return null;
  const name = catalog[String(pokemonId)]?.ko || catalog[String(pokemonId)]?.en || `도감 No. ${pokemonId}`;
  if (pokemonId === 888 && formId === 2577) return `${name} · 검왕`;
  if (pokemonId === 889 && formId === 2578) return `${name} · 방패왕`;
  return `${tier && [11, 13, 15].includes(tier) ? '그림자 ' : tier === 6 ? '메가' : ''}${name}`;
}

function absoluteTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const plain = value.slice(0, 19), wall = new Date(`${plain}Z`), parsed = Date.parse(value);
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (offset && (+offset[2] > 14 || +offset[3] > 59 || (+offset[2] === 14 && +offset[3] !== 0))) return null;
  return Number.isFinite(parsed) && Number.isFinite(wall.getTime()) && wall.toISOString().slice(0, 19) === plain ? parsed : null;
}
function publicHttps(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}
function result(status: LiveRaidStatus, now: Date, message: string): LiveRaidFeed {
  return { status, raids: [], fetchedAt: null, checkedAt: now.toISOString(), sourceName: null, message, discarded: { invalid: 0, stale: 0, ended: 0 } };
}

/** Only real observations from an explicitly configured provider enter this response. */
export function normalizeLiveRaidFeed(raw: unknown, now = new Date()): LiveRaidFeed {
  const data = record(raw), at = now.getTime(), fetchedAt = absoluteTime(data.fetchedAt), sourceName = text(data.sourceName, 120);
  const output = result('error', now, '공급원의 레이드 정보 형식을 확인할 수 없어요.');
  if (!sourceName || fetchedAt === null || fetchedAt > at + CLOCK_SKEW_MS || !Array.isArray(data.raids) || data.raids.length > MAX_RAIDS) return output;
  output.fetchedAt = new Date(fetchedAt).toISOString(); output.sourceName = sourceName;
  if (at - fetchedAt >= MAX_OBSERVATION_AGE_MS) return { ...output, status: 'stale', message: '공급원 정보가 10분 이상 갱신되지 않았어요. 새 관측을 기다리고 있어요.' };
  const unique = new Map<string, LiveRaid>();
  for (const value of data.raids) {
    const row = record(value), id = text(row.id, 160), gymName = text(row.gymName, 180), cityId = text(row.cityId, 80);
    const startsAt = absoluteTime(row.startsAt), endsAt = absoluteTime(row.endsAt), observedAt = absoluteTime(row.observedAt);
    const pokemonId = Number.isInteger(row.pokemonId) && Number(row.pokemonId) > 0 && Number(row.pokemonId) <= 10000 ? Number(row.pokemonId) : null;
    const formId = Number.isInteger(row.formId) && Number(row.formId) >= 0 ? Number(row.formId) : null;
    const tier = Number.isInteger(row.tier) && Number(row.tier) > 0 && Number(row.tier) < 100 ? Number(row.tier) : null;
    const bossName = row.bossName == null ? raidName(pokemonId, formId, tier) : text(row.bossName, 120), sourceUrl = row.sourceUrl == null ? null : publicHttps(row.sourceUrl);
    if (!id || !gymName || !cityId || !CITY_IDS.has(cityId) || typeof row.lat !== 'number' || !Number.isFinite(row.lat) || Math.abs(row.lat) > 90 || typeof row.lon !== 'number' || !Number.isFinite(row.lon) || Math.abs(row.lon) > 180 || startsAt === null || endsAt === null || observedAt === null || startsAt >= endsAt || endsAt - startsAt > 86_400_000 || startsAt > at + 7 * 86_400_000 || observedAt > at + CLOCK_SKEW_MS || (row.timeBasis !== 'source-response' && observedAt > fetchedAt + CLOCK_SKEW_MS) || (row.bossName != null && bossName === null) || (row.sourceUrl != null && sourceUrl === null)) { output.discarded.invalid++; continue; }
    const raid: LiveRaid = { id, gymName, cityId, lat: row.lat, lon: row.lon, bossName, sourceUrl, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), observedAt: new Date(observedAt).toISOString(), status: startsAt <= at ? 'active' : 'upcoming', expiresAt: new Date(Math.min(endsAt, observedAt + MAX_OBSERVATION_AGE_MS)).toISOString() };
    raid.timeBasis = row.timeBasis === 'source-response' ? 'source-response' : 'observed';
    raid.pokemonId = pokemonId; raid.formId = formId; raid.tier = tier;
    const sourceName = text(row.sourceName, 120); if (sourceName) raid.sourceName = sourceName;
    if (!unique.has(id) || unique.get(id)!.observedAt < raid.observedAt) unique.set(id, raid);
  }
  for (const raid of unique.values()) {
    if (Date.parse(raid.endsAt) <= at) { output.discarded.ended++; continue; }
    if (Date.parse(raid.expiresAt) <= at) { output.discarded.stale++; continue; }
    output.raids.push(raid);
  }
  output.raids.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  if (output.raids.length) return { ...output, status: 'ready', message: '최근 10분 이내에 관측된 레이드예요.' };
  if (output.discarded.stale) return { ...output, status: 'stale', message: '최근에 확인된 레이드가 없어요. 오래된 관측은 표시하지 않아요.' };
  if (output.discarded.invalid) return output;
  return { ...output, status: 'empty', message: '공급원이 정상 연결되었으며 현재 전달된 레이드는 없어요.' };
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('Invalid provider response');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > MAX_BYTES) throw new Error('Provider response too large'); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Feed URL/token come only from server environment, never query parameters or browser input. */
export async function loadLiveRaids(options: Options = {}): Promise<LiveRaidFeed> {
  const now = options.now && Number.isFinite(options.now.getTime()) ? options.now : new Date();
  const env: Env = options.env ?? { POKEDOKO_RAID_FEED_URL: process.env.POKEDOKO_RAID_FEED_URL, POKEDOKO_RAID_FEED_TOKEN: process.env.POKEDOKO_RAID_FEED_TOKEN, POKEDOKO_RAID_MAPS_ENABLED: process.env.POKEDOKO_RAID_MAPS_ENABLED }, url = env.POKEDOKO_RAID_FEED_URL;
  if (!url) {
    if (env.POKEDOKO_RAID_MAPS_ENABLED === 'false') return result('unconfigured', now, '실시간 지도 수집이 중지되어 있습니다.');
    try {
      const collected = await (options.mapCollector ?? collectPublicRaidMaps)();
      const output = normalizeLiveRaidFeed(collected.feed, now);
      output.sources = collected.sources;
      const connected = collected.sources.filter((s) => s.status === 'ready' || s.status === 'empty');
      if (!connected.length) return { ...output, status: collected.sources.some((s) => s.status === 'stale') ? 'stale' : 'error', raids: [], fetchedAt: null, message: '지역 지도에서 유효한 자료를 가져오지 못했습니다.' };
      output.sourceName = connected.map((s) => s.name).join(' · ');
      output.message = `${connected.length}개 지역 지도 연결 · 개별 체육관의 마지막 관측 시각은 제공되지 않습니다.`;
      return output;
    } catch { return result('error', now, '지역 지도 조회에 실패했습니다.'); }
  }
  const endpoint = publicHttps(url), token = env.POKEDOKO_RAID_FEED_TOKEN;
  if (!endpoint || (token !== undefined && (token.length > 4096 || /[\r\n]/.test(token)))) return result('error', now, '서버의 레이드 공급원 설정을 확인해 주세요.');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, { headers, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return normalizeLiveRaidFeed(await boundedJson(response), now);
  } catch { return result('error', now, '레이드 공급원에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.'); }
}
