"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { useState } from "react";
import { ArrowUpRight, ChevronRight, Globe2 } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { formatKst } from "@/lib/raid-time";
import type { LiveRaid, LiveRaidSource, LiveRaidStatus } from "@/lib/live-raid-types";

const regionalMaps = [
  { name: "뉴욕", url: "https://www.nycpokemap.com/gym.html" },
  { name: "시드니", url: "https://www.sydneypogomap.com/gym.html" },
  { name: "싱가포르", url: "https://sgpokemap.com/gym.html" },
  { name: "런던", url: "https://londonpogomap.com/gym.html" },
  { name: "밴쿠버", url: "https://vanpokemap.com/gym.html" },
];
export default function RaidCoverage({ sources, raids, now, selectedCity, onSelect, feedStatus }: {
  sources: LiveRaidSource[];
  raids: LiveRaid[];
  now: Date;
  selectedCity: string;
  onSelect: (id: string) => void;
  feedStatus: LiveRaidStatus | "loading";
}) {
  const [expanded, setExpanded] = useState(false);
  const time = now.getTime();
  const cities = CITIES.map((city) => {
    const own = sources.filter((source) => source.cityId === city.id);
    const fresh = own.filter((source) => (source.status === "ready" || source.status === "empty") && source.fetchedAt && time - Date.parse(source.fetchedAt) < 600000);
    const current = raids.filter((raid) => raid.cityId === city.id);
    const active = current.filter((raid) => Date.parse(raid.startsAt) <= time).length;
    const coverage = own.find((source) => source.coverage)?.coverage;
    const status = fresh.length ? "connected" : own.some((source) => source.status === "stale" || source.fetchedAt && time - Date.parse(source.fetchedAt) >= 600000) ? "stale" : own.length ? "error" : ["error", "stale", "unconfigured"].includes(feedStatus) ? feedStatus : "loading";
    return { city, own, fresh, current, active, coverage, status };
  }).sort((a, b) => {
    const priority = (id: string) => id === "seoul" ? 2 : id === "tokyo" ? 1 : 0;
    return priority(b.city.id) - priority(a.city.id) || b.current.length - a.current.length || a.city.name.localeCompare(b.city.name, "ko");
  });
  const shown = expanded ? cities : cities.filter((item, index) => index < 6 || item.city.id === selectedCity);
  return <LanguageScope>{(
    <section className="panel live-external-maps world-raid-coverage" aria-label="세계 주요 도시 실시간 수집 상태">
      <div className="live-toolbar">
        <div><span className="mini-label">WORLD COVERAGE</span><h2><Globe2 size={19} /> 세계 주요 도시 수집 상태</h2></div>
        <span className="live-source">대표 {CITIES.length}개 도시 조회</span>
      </div>
      <p className="world-coverage-intro">각 도시 중심 반경 15km에서 최대 800개를 조회하고, 아래 5개 지역 지도 자료도 함께 확인해요. 전 세계 모든 체육관을 수집하는 것은 아닙니다.</p>
      <div className="world-coverage-grid">
        {shown.map(({ city, own, fresh, current, active, coverage, status }) => {
          const latest = fresh.map((source) => source.fetchedAt!).sort().at(-1);
          return (
            <article className="world-coverage-card" key={city.id} data-status={status} data-selected={selectedCity === city.id}>
              <button type="button" onClick={() => onSelect(city.id)} aria-label={`${city.name} 실시간 레이드 선택`}>
                <span className="world-coverage-name"><span>{city.countryCode.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))}</span><strong>{city.name}</strong><ChevronRight size={15} /></span>
                <span className="world-coverage-country">{city.country}</span>
                <span className="world-coverage-count">{current.length ? `진행 ${active} · 대기 ${current.length - active}` : status === "connected" ? "자료 미확인 · 현재 표시할 레이드 없음" : status === "loading" ? "조회 중" : status === "stale" ? "원문 갱신 지연" : status === "unconfigured" ? "실시간 수집 중지" : "조회 실패"}</span>
              </button>
              <div className="world-coverage-meta">
                <span>{coverage ? `주변 조회: ${coverage.radiusKm}km · ${coverage.limit}개 상한` : "지역 지도 범위"}{coverage?.limited ? " · 상한 도달" : ""}</span>
                {coverage && own.some((source) => !source.coverage) && <span>지역 지도 자료도 함께 집계</span>}
                {latest && <span>원문 응답 {formatKst(new Date(latest))}</span>}
                {!!own.length && <a href={own[0].url} target="_blank" rel="noreferrer">원문 지도 <ArrowUpRight size={12} /></a>}
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="world-coverage-expand" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "도시 접기" : `${CITIES.length}개 도시 모두 보기`}</button>
      <div className="world-coverage-links"><span>함께 수집하는 지역 지도</span>{regionalMaps.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name}<ArrowUpRight size={12} /></a>)}<a href="https://pokecoords.iflowgo.com/" target="_blank" rel="noreferrer">PoGo Radar<ArrowUpRight size={12} /></a></div>
      <p className="world-coverage-footnote">응답이 비어 있으면 야간·미수집·미보고 여부를 구분할 수 없어 ‘자료 미확인’으로 표시해요. 참여 인원·모집 상태는 공급원에서 제공하지 않습니다.</p>
    </section>
  )}</LanguageScope>;
}
