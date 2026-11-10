"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Egg,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Swords,
  X,
} from "lucide-react";
import { CITIES } from "@/lib/cities";
import {
  countdown,
  formatKst,
  formatLocal,
  getGymState,
} from "@/lib/raid-time";
import type { City, GymObservation } from "@/lib/pokedoko-types";
import type { LiveRaidFeed, LiveRaidStatus } from "@/lib/live-raid-types";
import map from "@/lib/world-map.json";
import CoordinateCopyButton from "./CoordinateCopyButton";
import { useSharedUrlState } from "./ShareButton";
import type { RaidKind } from "@/lib/live-raid-filters";
import { hasMinimumRaidTime } from "@/lib/live-raid-display";
import { distanceKm } from "@/lib/raid-hotspots";
import RaidHotspots, { RaidRegionSummary, type RaidRegion } from "./RaidHotspots";
import RaidCoverage from "./RaidCoverage";
import { LIVE_RAID_REQUEST_TIMEOUT_MS, LIVE_RAID_RETRY_DELAYS_MS, retainLastGoodRaidFeed } from "@/lib/live-raid-recovery";
import {
  RAID_KIND_OPTIONS,
  buildRaidBossOptions,
  changeRaidFilters,
  matchesRaidFilters,
  raidKind,
  raidTierKey,
  raidTierLabel,
  resetRaidFilters,
  type RaidFilters,
} from "@/lib/live-raid-filters";

type Props = {
  now: Date;
  city: City;
  onCityChange: (id: string) => void;
  observations: GymObservation[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSchedule: () => void;
};
const STATUS_LABEL: Record<LiveRaidStatus | "loading", string> = {
  loading: "실시간 자료 확인 중",
  unconfigured: "실시간 데이터 미연결",
  ready: "실시간 자료 연결됨",
  empty: "확인된 레이드 없음",
  stale: "관측 자료 갱신 필요",
  error: "실시간 자료 조회 실패",
};
const STATUS_HELP: Record<LiveRaidStatus | "loading", string> = {
  loading: "체육관별 시작·종료 시간을 확인하고 있습니다.",
  unconfigured:
    "전 세계 체육관의 진행 상황은 아직 조회할 수 없습니다. 아래에서 직접 확인한 기록을 관리할 수 있습니다.",
  ready:
    "종료까지 5분 이상 남은 레이드만 표시합니다. 5분 미만이 되거나 자료의 유효기간이 지나면 자동으로 제외됩니다.",
  empty: "연결된 지역 지도에 종료까지 5분 이상 남은 유효한 레이드가 없습니다.",
  stale:
    "최신 관측 자료가 없어 진행 여부를 확인할 수 없습니다. 오래된 자료는 지도와 집계에서 제외합니다.",
  error: "공급원의 진행 상황을 확인할 수 없습니다. 잠시 후 다시 조회하세요.",
};
function isFeed(value: unknown): value is LiveRaidFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as LiveRaidFeed;
  return (
    ["unconfigured", "ready", "empty", "stale", "error"].includes(
      feed.status,
    ) && Array.isArray(feed.raids)
  );
}
function flag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export default function LiveRaids({
  now,
  city,
  onCityChange,
  observations,
  onAdd,
  onDelete,
  onSchedule,
}: Props) {
  const [feed, setFeed] = useState<LiveRaidFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [retryRound, setRetryRound] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cityFilter, setCityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [raidFilters, setRaidFilters] = useState<RaidFilters>(resetRaidFilters);
  const [showAllBosses, setShowAllBosses] = useState(false);
  const allBossOptions = useMemo(
    () => buildRaidBossOptions(feed?.raids ?? []),
    [feed],
  );
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [selectedRegion, setSelectedRegion] = useState<RaidRegion | null>(null);
  useSharedUrlState("live", {
    liveCity: cityFilter, boss: raidFilters.bossKey, kind: raidFilters.kind, tier: raidFilters.tier,
    state: stateFilter, q: query, center: selectedRegion,
  }, (shared) => {
    setCityFilter(shared.liveCity ?? shared.city ?? "all");
    setStateFilter(shared.state ?? "active");
    setQuery(shared.q ?? "");
    setRaidFilters({ bossKey: shared.boss ?? "all", kind: (shared.kind ?? "all") as RaidKind, tier: shared.tier ?? "all" });
    setSelectedRegion(shared.center ?? null);
    setVisibleLimit(30);
  });
  function updateRaidFilters(update: RaidFilters | ((current: RaidFilters) => RaidFilters)) {
    setSelectedRegion(null);
    setRaidFilters(update);
  }

  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async function doRefresh(attempt = 0) {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    const id = ++request.current;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const timeout = setTimeout(() => current.abort(), LIVE_RAID_REQUEST_TIMEOUT_MS);
    setLoading(true);
    setRetryRound(attempt);
    try {
      const response = await fetch("/api/raids/live", {
        cache: "no-store",
        signal: current.signal,
      });
      if (!response.ok) throw new Error("HTTP response failed");
      const next: unknown = await response.json();
      if (!isFeed(next)) throw new Error("Invalid response");
      if (next.status === "error" || next.status === "stale") throw new Error("Provider refresh failed");
      if (id === request.current) {
        setFeed(next);
        setRefreshError(null);
        setRetryRound(0);
      }
    } catch {
      if (id === request.current) {
        setRefreshError(current.signal.aborted ? "응답 대기 시간이 초과됐습니다." : "최근 자료 갱신에 실패했습니다.");
        const failure: LiveRaidFeed = {
          status: "error",
          raids: [],
          fetchedAt: null,
          checkedAt: new Date().toISOString(),
          sourceName: null,
          message: "자료를 불러오지 못했습니다.",
          discarded: { invalid: 0, stale: 0, ended: 0 },
        };
        setFeed((previous) => retainLastGoodRaidFeed(previous, failure));
        const delay = LIVE_RAID_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          setRetryRound(attempt + 1);
          retryTimer.current = setTimeout(() => {
            if (id === request.current) void doRefresh(attempt + 1);
          }, delay);
        } else setRetryRound(0);
      }
    } finally {
      clearTimeout(timeout);
      if (id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 60000);
    return () => {
      clearInterval(poll);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      request.current++;
      controller.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    setVisibleLimit(30);
  }, [cityFilter, stateFilter, query, raidFilters]);
  useEffect(() => setVisibleLimit(30), [selectedRegion]);

  const time = now.getTime();
  const feedExpired =
    feed?.fetchedAt && time - Date.parse(feed.fetchedAt) >= 600000;
  const validRecords = (feedExpired ? [] : (feed?.raids ?? [])).filter(
    (r) => Date.parse(r.expiresAt) > time && Date.parse(r.endsAt) > time,
  );
  const records = validRecords.filter((r) => hasMinimumRaidTime(r, now));
  const active = records.filter((r) => Date.parse(r.startsAt) <= time);
  const upcoming = records
    .filter((r) => Date.parse(r.startsAt) > time)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const status =
    feedExpired && (feed?.status === "ready" || feed?.status === "empty")
      ? "stale"
      : feed?.status === "ready" && !validRecords.length
        ? feed.raids.some((r) => Date.parse(r.endsAt) > time)
          ? "stale"
          : "empty"
        : feed?.status === "ready" && !records.length
          ? "empty"
          : (feed?.status ?? "loading");
  const sourceReady = status === "ready" || status === "empty";
  const cities = CITIES.map((c) => ({
    city: c,
    active: active.filter((r) => r.cityId === c.id).length,
    upcoming: upcoming.filter((r) => r.cityId === c.id).length,
  }));
  const availableCities = cities
    .filter((c) => c.active || c.upcoming)
    .sort((a, b) => b.active - a.active || b.upcoming - a.upcoming);
  const scopedRaids = records
    .filter((r) => {
      const c = CITIES.find((c) => c.id === r.cityId);
      const state = Date.parse(r.startsAt) > time ? "upcoming" : "active";
      return (
        (cityFilter === "all" || r.cityId === cityFilter) &&
        (stateFilter === "all" || state === stateFilter) &&
        `${r.gymName} ${r.bossName ?? ""} ${c?.name} ${c?.nameEn} ${c?.country}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      );
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const matchingRaids = scopedRaids.filter((r) => matchesRaidFilters(r, raidFilters));
  const bossCandidates = scopedRaids.filter((r) => matchesRaidFilters(r, { ...raidFilters, bossKey: "all" }));
  const bossOptions = buildRaidBossOptions(bossCandidates);
  if (raidFilters.bossKey !== "all" && !bossOptions.some((o) => o.key === raidFilters.bossKey)) {
    const selectedBoss = allBossOptions.find((o) => o.key === raidFilters.bossKey);
    if (selectedBoss) bossOptions.push({ ...selectedBoss, count: 0 });
  }
  const visibleBossOptions = showAllBosses ? bossOptions : bossOptions.filter((o, i) => i < 8 || o.key === raidFilters.bossKey);
  const gradeCandidates = scopedRaids.filter((r) => raidFilters.kind === "all" || raidKind(r) === raidFilters.kind);
  const tierKeys = [...new Set(gradeCandidates.map(raidTierKey))];
  if (raidFilters.tier !== "all" && !tierKeys.includes(raidFilters.tier)) tierKeys.push(raidFilters.tier);
  tierKeys.sort((a, b) => (a === "unknown" ? Infinity : Number(a)) - (b === "unknown" ? Infinity : Number(b)));
  const hasRaidFilters = raidFilters.bossKey !== "all" || raidFilters.kind !== "all" || raidFilters.tier !== "all";
  const filtered = selectedRegion
    ? matchingRaids.filter((r) => r.cityId === selectedRegion.cityId && distanceKm(selectedRegion, r) <= selectedRegion.radiusKm + 1e-9)
    : matchingRaids;
  const gyms = observations.filter((o) => o.cityId === city.id);
  function selectCity(id: string) {
    setSelectedRegion(null);
    setCityFilter(id);
    onCityChange(id);
  }

  return (
    <div className="live-raid-page">
      <section
        className="live-data-status"
        data-status={status}
        data-refresh-error={refreshError ? "true" : undefined}
        aria-label="실시간 데이터 연결 상태"
      >
        <span className="live-status-icon">
          <Radio size={23} />
        </span>
        <div className="live-status-copy">
          <h2>{refreshError && sourceReady ? "최근 자료 표시 · 갱신 재시도" : refreshError && (loading || retryRound) ? "실시간 자료 다시 연결 중" : STATUS_LABEL[status]}</h2>
          <p>{refreshError && sourceReady ? "아직 유효한 마지막 응답을 표시합니다. 원문 시각과 남은 시간은 그대로 적용돼요." : STATUS_HELP[status]}</p>
          {refreshError && <p className="live-refresh-warning" role="status">{refreshError} {retryRound ? `자동 재시도 ${retryRound}/2` : "새로고침으로 다시 연결할 수 있어요."}</p>}
          {feed?.sources?.length ? (
            <p className="live-coverage">
              세계 주요 도시 24곳 중심 반경 조회와 5개 지역 지도 자료입니다.
              체육관별 마지막 관측 시각과 실제 참여 인원은 제공되지 않습니다.
            </p>
          ) : null}
          {feed?.sourceName && (
            <small className="live-source">
              출처: {feed.sourceName}
              {feed.fetchedAt &&
                ` · 원문 응답 ${formatKst(new Date(feed.fetchedAt))}`}
            </small>
          )}
          {feed?.checkedAt && (
            <small className="live-source">
              서버 확인 {formatKst(new Date(feed.checkedAt))} · 1분마다 갱신
            </small>
          )}
        </div>
        <button
          className="secondary-button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "spinning" : ""} />
          {loading ? "조회 중" : "새로고침"}
        </button>
      </section>
      <div className="metrics">
        <article>
          <span>
            <Swords size={16} />
            진행 중
          </span>
          <strong>
            {sourceReady ? active.length : "—"}
            <small> 개</small>
          </strong>
          <p>연동 자료의 유효한 레이드</p>
        </article>
        <article>
          <span>
            <Egg size={16} />
            시작 대기
          </span>
          <strong>
            {sourceReady ? upcoming.length : "—"}
            <small> 개</small>
          </strong>
          <p>시작 시각이 확인된 체육관</p>
        </article>
        <article>
          <span>
            <MapPin size={16} />
            자료 있는 도시
          </span>
          <strong>
            {sourceReady ? availableCities.length : "—"}
            <small> 곳</small>
          </strong>
          <p>공급원 관측 범위 기준</p>
        </article>
        <article>
          <span>
            <Clock3 size={16} />
            다음 시작까지
          </span>
          <strong className="count-number">
            {upcoming[0]
              ? countdown(Date.parse(upcoming[0].startsAt) - time)
              : "—"}
          </strong>
          <p>{upcoming[0]?.gymName ?? "확인된 다음 부화 시간 없음"}</p>
        </article>
      </div>
      <RaidCoverage sources={feed?.sources ?? []} raids={records} now={now} selectedCity={cityFilter} onSelect={selectCity} feedStatus={status} />
      <div className="map-layout">
        <section className="panel world-panel">
          <div className="panel-heading">
            <div>
              <span className="mini-label">LIVE RAIDS</span>
              <h2>체육관 레이드 지도</h2>
            </div>
            <span className="live-label">지역 지도 게시 자료</span>
          </div>
          <div className="map-legend">
            <span>
              <i className="dot mint" />
              진행 중
            </span>
            <span>
              <i className="dot gold" />
              시작 대기
            </span>
            <span>
              <i className="dot gray" />
              자료 미확인
            </span>
          </div>
          <div className="live-map">
            <svg
              className="world-map"
              viewBox="0 0 1000 470"
              role="group"
              aria-label="관측 자료가 있는 도시별 레이드 지도"
            >
              {map.paths.map((d, i) => (
                <path key={i} d={d} className="land" />
              ))}
              {cities.map(({ city: c, active: count, upcoming: waiting }) => (
                <g
                  key={c.id}
                  transform={`translate(${((c.lon + 180) * 1000) / 360},${((85 - c.lat) * 470) / 170})`}
                  className={`map-pin ${count ? "live" : waiting ? "upcoming" : "ended"}${cityFilter === c.id ? " selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.name}: ${count ? `진행 중 ${count}개` : waiting ? `시작 대기 ${waiting}개` : "자료 미확인"}`}
                  onClick={() => selectCity(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectCity(c.id);
                    }
                  }}
                >
                  <circle className="pin-halo" r="14" />
                  <circle className="pin-core" r="5" />
                  {cityFilter === c.id && (
                    <>
                      <rect x="-48" y="-43" width="96" height="26" rx="7" />
                      <text textAnchor="middle" y="-25">
                        {c.name}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </svg>
            {!records.length && (
              <div className="live-map-empty">
                <Radio size={20} />
                <strong>
                  {status === "empty" ? "확인된 레이드 없음" : "관측 자료 없음"}
                </strong>
                <span>
                  {status === "unconfigured"
                    ? "데이터 연결 대기"
                    : "유효한 관측 자료가 있으면 표시됩니다."}
                </span>
              </div>
            )}
          </div>
          <div className="map-bottom">
            <span>도시 중심 위치 기준</span>
            <small>자료가 없는 지역의 실제 진행 여부는 알 수 없습니다.</small>
          </div>
        </section>
        <aside className="panel live-city-summary">
          <div className="panel-heading">
            <div>
              <span className="mini-label">BY CITY</span>
              <h2>도시별 레이드 현황</h2>
            </div>
            <MapPin size={20} />
          </div>
          {availableCities.length ? (
            availableCities.map(
              ({ city: c, active: count, upcoming: waiting }) => (
                <button
                  className="live-city-row"
                  key={c.id}
                  onClick={() => selectCity(c.id)}
                >
                  <span>
                    <strong>
                      {flag(c.countryCode)} {c.name}
                    </strong>
                    <small>
                      진행 {count} · 대기 {waiting}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ),
            )
          ) : (
            <div className="live-empty">
              <MapPin size={26} />
              <h3>확인된 도시 없음</h3>
              <p>연결된 지역 지도에서 유효한 레이드를 확인하면 표시합니다.</p>
            </div>
          )}
          <p className="panel-caption">
            연결된 공급원의 자료 수입니다. 전 세계 체육관 수·참여 인원·밀집도
            순위는 아닙니다.
          </p>
          <button className="live-inline-link" onClick={onSchedule}>
            레이드아워 시간표 <ArrowUpRight size={15} />
          </button>
        </aside>
      </div>
      <section
        className="panel live-raid-list"
        aria-label="연동된 실시간 레이드 목록"
      >
        <div className="live-toolbar">
          <div>
            <span className="mini-label">RAID LIST</span>
            <h2>
              체육관별 진행 상황{" "}
              <small className="live-result-count">{filtered.length}개</small>
            </h2>
          </div>
          <span className="live-source">종료까지 5분 이상 · 한국시간(KST)</span>
        </div>
        <div className="live-filters">
          <label className="live-city-select">
            <span>도시</span>
            <select
              aria-label="실시간 레이드 도시"
              value={cityFilter}
              onChange={(e) => {
                setSelectedRegion(null);
                setCityFilter(e.target.value);
                if (e.target.value !== "all") onCityChange(e.target.value);
              }}
            >
              <option value="all">전체 도시</option>
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.country} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="live-tabs" aria-label="레이드 상태">
            {[
              { id: "active", name: "진행 중" },
              { id: "upcoming", name: "시작 대기" },
              { id: "all", name: "전체" },
            ].map((s) => (
              <button
                key={s.id}
                aria-pressed={stateFilter === s.id}
                className={stateFilter === s.id ? "active" : ""}
                onClick={() => { setSelectedRegion(null); setStateFilter(s.id); }}
              >
                {s.name}
              </button>
            ))}
          </div>
          <label className="table-search">
            <Search size={16} />
            <input
              aria-label="실시간 레이드 검색"
              maxLength={100}
              placeholder="체육관·지역 검색"
              value={query}
              onChange={(e) => { setSelectedRegion(null); setQuery(e.target.value.slice(0, 100)); }}
            />
          </label>
        </div>
        <section className="live-raid-choices" aria-label="보스와 레이드 종류 선택">
          <div className="live-choice-heading">
            <h3>보스·종류 선택</h3>
            {hasRaidFilters && (
              <button type="button" onClick={() => updateRaidFilters(resetRaidFilters())}>
                선택 초기화
              </button>
            )}
          </div>
          <div className="live-choice-group">
            <span className="live-choice-label" id="raid-kind-label">레이드 종류</span>
            <div className="live-choice-chips" role="group" aria-labelledby="raid-kind-label">
              {RAID_KIND_OPTIONS.map((option) => {
                const count = option.key === "all"
                  ? scopedRaids.length
                  : scopedRaids.filter((r) => raidKind(r) === option.key).length;
                return (
                  <button
                    type="button"
                    key={option.key}
                    aria-pressed={raidFilters.kind === option.key}
                    disabled={!count && raidFilters.kind !== option.key && option.key !== "all"}
                    onClick={() => {
                      if (raidFilters.kind !== option.key)
                        updateRaidFilters((current) => changeRaidFilters(current, { kind: option.key }));
                    }}
                  >
                    {option.label}<span>{count}</span>
                  </button>
                );
              })}
              <button type="button" disabled className="live-choice-unavailable" title="현재 수집 자료에 맥스배틀이 포함되지 않습니다.">
                맥스배틀 · 미지원
              </button>
            </div>
          </div>
          <div className="live-choice-group">
            <span className="live-choice-label" id="raid-grade-label">등급</span>
            <div className="live-choice-chips" role="group" aria-labelledby="raid-grade-label">
              <button type="button" aria-pressed={raidFilters.tier === "all"} onClick={() => updateRaidFilters((current) => changeRaidFilters(current, { tier: "all" }))}>
                전체<span>{gradeCandidates.length}</span>
              </button>
              {tierKeys.map((key) => (
                <button type="button" key={key} aria-pressed={raidFilters.tier === key} onClick={() => updateRaidFilters((current) => changeRaidFilters(current, { tier: key }))}>
                  {raidTierLabel(key)}<span>{gradeCandidates.filter((r) => raidTierKey(r) === key).length}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="live-choice-group">
            <span className="live-choice-label" id="raid-boss-label">보스</span>
            <div className="live-choice-chips live-boss-chips" role="group" aria-labelledby="raid-boss-label">
              <button type="button" aria-pressed={raidFilters.bossKey === "all"} onClick={() => updateRaidFilters((current) => changeRaidFilters(current, { bossKey: "all" }))}>
                전체<span>{bossCandidates.length}</span>
              </button>
              {visibleBossOptions.map((option) => (
                <button type="button" key={option.key} aria-pressed={raidFilters.bossKey === option.key} onClick={() => updateRaidFilters((current) => changeRaidFilters(current, { bossKey: current.bossKey === option.key ? "all" : option.key }))}>
                  {option.label}<span>{option.count}</span>
                </button>
              ))}
              {bossOptions.length > 8 && (
                <button type="button" className="live-choice-more" aria-expanded={showAllBosses} onClick={() => setShowAllBosses((value) => !value)}>
                  {showAllBosses ? "보스 접기" : `보스 더 보기 (${bossOptions.length})`}
                </button>
              )}
            </div>
          </div>
          <p className="live-choice-note">선택한 도시·진행 상태·검색 조건의 유효한 레이드에서 집계합니다. 맥스배틀은 포함되지 않습니다.</p>
          <p className="live-choice-note live-participant-note">참여 인원은 제공되지 않아요. 밀집 순위는 레이드 수 기준이에요.</p>
        </section>
        <RaidHotspots raids={matchingRaids} now={now} selected={selectedRegion} onSelect={setSelectedRegion} />
        <div id="live-gym-results" className="live-gym-results" tabIndex={-1}>
          {selectedRegion && <RaidRegionSummary region={selectedRegion} raids={filtered} now={now} onClear={() => setSelectedRegion(null)} />}
          <p className="live-results-label">{selectedRegion ? `선택한 반경 안 체육관 ${filtered.length}개` : `조건에 맞는 체육관 ${filtered.length}개`}</p>
        </div>
        {filtered.length ? (
          <div className="live-grid">
            {filtered.slice(0, visibleLimit).map((r) => {
              const c = CITIES.find((c) => c.id === r.cityId)!;
              const pending = Date.parse(r.startsAt) > time;
              return (
                <article
                  className="live-raid-card"
                  key={r.id}
                  data-state={pending ? "upcoming" : "active"}
                >
                  <div className="live-card-top">
                    <span className="live-card-status">
                      {pending ? "시작 대기" : "진행 중"}
                    </span>
                    <span>
                      {flag(c.countryCode)} {c.name}
                    </span>
                  </div>
                  <h3>{r.gymName}</h3>
                  <p>
                    {r.bossName || "알 · 보스 미공개"}
                    {r.tier && (
                      <span className="live-tier">
                        {(
                          {
                            1: "1성",
                            3: "3성",
                            4: "4성",
                            5: "5성",
                            6: "메가",
                            9: "엘리트",
                            11: "그림자 1성",
                            13: "그림자 3성",
                            15: "그림자 5성",
                          } as Record<number, string>
                        )[r.tier] ?? `등급 ${r.tier}`}
                      </span>
                    )}
                  </p>
                  <strong className="gym-countdown">
                    {countdown(
                      Date.parse(pending ? r.startsAt : r.endsAt) - time,
                    )}
                  </strong>
                  <small>{pending ? "시작까지" : "종료까지"}</small>
                  {!pending && (
                    <div className="live-raid-elapsed" role="progressbar" aria-label={`${r.gymName} 레이드 경과 시간`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(100, (time - Date.parse(r.startsAt)) / (Date.parse(r.endsAt) - Date.parse(r.startsAt)) * 100)))}>
                      <span style={{ width: `${Math.max(0, Math.min(100, (time - Date.parse(r.startsAt)) / (Date.parse(r.endsAt) - Date.parse(r.startsAt)) * 100))}%` }} />
                    </div>
                  )}
                  <dl className="live-card-times">
                    <div>
                      <dt>시작</dt>
                      <dd>{formatKst(new Date(r.startsAt))}</dd>
                    </div>
                    <div>
                      <dt>종료</dt>
                      <dd>{formatKst(new Date(r.endsAt))}</dd>
                    </div>
                    <div>
                      <dt>현지 시각</dt>
                      <dd>
                        {formatLocal(now, c.zone)} · {c.zone}
                      </dd>
                    </div>
                  </dl>
                  <small className="live-source">
                    {r.timeBasis === "source-response" ? "원문 응답" : "관측"}{" "}
                    {formatKst(new Date(r.observedAt))}
                    {r.sourceName && ` · ${r.sourceName}`}
                  </small>
                  <div className="live-card-links">
                    <CoordinateCopyButton
                      lat={r.lat}
                      lon={r.lon}
                      name={r.gymName}
                      city={r.cityId}
                    />
                    {r.sourceUrl && (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                        원문 지도 <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="live-empty">
            <Swords size={30} />
            <h3>
              {status === "unconfigured"
                ? "실시간 공급원이 연결되지 않았습니다"
                : query || cityFilter !== "all"
                  ? "조건에 맞는 레이드 없음"
                  : "표시할 관측 자료 없음"}
            </h3>
            <p>
              {status === "unconfigured"
                ? "공식 레이드아워 일정은 별도 시간표에서 확인하세요."
                : "진행 여부가 확인된 체육관만 표시합니다."}
            </p>
            {(query || cityFilter !== "all" || stateFilter !== "active" || hasRaidFilters) && (
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setCityFilter("all");
                  setStateFilter("active");
                  updateRaidFilters(resetRaidFilters());
                }}
              >
                필터 초기화
              </button>
            )}
          </div>
        )}
        {filtered.length > visibleLimit && (
          <div className="live-load-more">
            <button
              className="secondary-button"
              onClick={() => setVisibleLimit((n) => n + 30)}
            >
              레이드 30개 더 보기 <ChevronRight size={15} />
            </button>
            <span>
              {Math.min(visibleLimit, filtered.length)} / {filtered.length}개
              표시
            </span>
          </div>
        )}
      </section>
      <section id="gym-timers" className="panel gym-panel">
        <div className="panel-heading">
          <div>
            <span className="mini-label">MY RECORDS</span>
            <h2>직접 등록한 체육관</h2>
            <p>
              직접 입력한 시간 기준입니다. 자동 수집 자료와 별도로 보관합니다.
            </p>
          </div>
          <button className="primary-button" onClick={onAdd}>
            <Plus size={17} />
            체육관 등록
          </button>
        </div>
        <label className="live-city-select">
          <span>기록할 도시</span>
          <select
            aria-label="직접 등록 도시"
            value={city.id}
            onChange={(e) => onCityChange(e.target.value)}
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.country} · {c.name}
              </option>
            ))}
          </select>
        </label>
        {gyms.length ? (
          <div className="gym-grid">
            {gyms.map((o) => {
              const state = getGymState(o, now);
              return (
                <article className="gym-card" key={o.id}>
                  <div className="gym-card-top">
                    <span className="manual-label">
                      직접 등록 ·{" "}
                      {state === "waiting"
                        ? "시작 대기"
                        : state === "active"
                          ? "입력한 시간상 진행 중"
                          : state === "ended"
                            ? "종료"
                            : "종료 미확인"}
                    </span>
                    <button
                      aria-label={`${o.name} 삭제`}
                      onClick={() => onDelete(o.id)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <h3>{o.name}</h3>
                  <p>{o.pokemonName || "보스 미등록"}</p>
                  <strong className="gym-countdown">
                    {state === "waiting"
                      ? countdown(Date.parse(o.startsAt) - time)
                      : state === "active" && o.endsAt
                        ? countdown(Date.parse(o.endsAt) - time)
                        : state === "ended"
                          ? "종료"
                          : "종료 시각 미등록"}
                  </strong>
                  <small>
                    {state === "waiting"
                      ? "시작까지"
                      : state === "active"
                        ? "종료까지"
                        : "입력한 시간 기준"}
                  </small>
                  <dl className="live-card-times">
                    <div>
                      <dt>시작</dt>
                      <dd>{formatKst(new Date(o.startsAt))}</dd>
                    </div>
                    {o.endsAt && (
                      <div>
                        <dt>종료</dt>
                        <dd>{formatKst(new Date(o.endsAt))}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="live-empty">
            <Egg size={30} />
            <h3>{city.name}에 등록한 기록 없음</h3>
            <p>확인한 체육관의 시작·종료 시각을 한국시간으로 입력하세요.</p>
            <button className="text-button" onClick={onAdd}>
              체육관 등록 <ChevronRight size={15} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
