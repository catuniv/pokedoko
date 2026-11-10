"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, LocateFixed, MapPin, RefreshCw, X } from "lucide-react";
import { CITIES } from "@/lib/cities";
import type { LiveRaid } from "@/lib/live-raid-types";
import { findRaidHotspots, type RaidHotspot } from "@/lib/raid-hotspots";
import CoordinateCopyButton from "./CoordinateCopyButton";
import hotspotWorkerUrl from "../../lib/raid-hotspots.worker.ts?worker&url";

export type RaidRegion = {
  id: string;
  cityId: string;
  lat: number;
  lon: number;
  gymName: string;
  radiusKm: number;
};

type Props = {
  raids: LiveRaid[];
  now: Date;
  selected: RaidRegion | null;
  onSelect: (region: RaidRegion | null) => void;
};

export default function RaidHotspots({ raids, now, selected, onSelect }: Props) {
  const [radiusKm, setRadiusKm] = useState(3);
  const [result, setResult] = useState<{
    key: string;
    spots: RaidHotspot[];
    error?: boolean;
  }>({ key: "", spots: [] });
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  // Time ticks must not repeat the spatial calculation when membership is unchanged.
  // Include positions and labels so a refreshed source cannot reuse an old region.
  const inputKey = raids
    .map((r) => `${r.id}\u0001${r.cityId}\u0001${r.lat}\u0001${r.lon}\u0001${r.gymName}`)
    .join("\u0002");
  const calculationKey = `${radiusKm}\u0000${inputKey}`;

  useEffect(() => {
    try {
      worker.current = new Worker(
        new URL(hotspotWorkerUrl, window.location.origin),
        { type: "module" },
      );
    } catch {
      worker.current = null;
    }
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const id = ++request.current;
    let canceled = false;
    const complete = (spots: RaidHotspot[], error = false) => {
      if (!canceled && request.current === id)
        setResult({ key: calculationKey, spots, error });
    };
    const fallback = () => {
      try {
        complete(findRaidHotspots(raids, radiusKm));
      } catch {
        complete([], true);
      }
    };
    const timer = setTimeout(() => {
      const current = worker.current;
      if (!current) return fallback();
      current.onmessage = (event: MessageEvent<{
        requestId: number;
        spots: RaidHotspot[];
        error?: boolean;
      }>) => {
        if (event.data.requestId === id)
          complete(event.data.spots, event.data.error);
      };
      current.onerror = () => {
        current.terminate();
        if (worker.current === current) worker.current = null;
        if (!canceled) fallback();
      };
      try {
        current.postMessage({ requestId: id, raids, radiusKm });
      } catch {
        current.terminate();
        worker.current = null;
        fallback();
      }
    }, 80);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
    // inputKey represents every field consumed by the spatial calculation.
    // A new array from the one-second countdown alone should not start a worker job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculationKey]);

  const ready = result.key === calculationKey;
  const spots = ready && raids.length ? result.spots : [];
  const byId = new Map(raids.map((r) => [r.id, r]));

  return (
    <section className="raid-hotspots" aria-labelledby="raid-hotspots-title" aria-busy={!ready && !!raids.length}>
      <div className="raid-hotspots-heading">
        <div>
          <span className="mini-label"><LocateFixed size={14} /> RADIUS SEARCH</span>
          <h3 id="raid-hotspots-title">반경 안 레이드 많은 곳</h3>
          <p>위에서 고른 도시·진행 상태·검색어를 기준으로 비교해요.</p>
        </div>
        <div className="raid-radius-options" role="group" aria-label="레이드 검색 반경">
          {[1, 3, 5, 10].map((radius) => (
            <button
              type="button"
              key={radius}
              aria-pressed={radiusKm === radius}
              onClick={() => {
                if (radiusKm !== radius) {
                  onSelect(null);
                  setRadiusKm(radius);
                }
              }}
            >{radius}km</button>
          ))}
        </div>
      </div>
      <p className="raid-hotspots-method">
        각 체육관 좌표를 중심으로 반경 {radiusKm}km 안의 레이드 수를 비교합니다.
        같은 체육관이 겹치는 지역은 한 번만 추천하며 최대 5곳을 표시해요. 종료까지 5분 이상인 자료만 포함합니다.
      </p>
      {spots.length ? (
        <ol className="raid-hotspot-grid">
          {spots.map((spot, index) => {
            const city = CITIES.find((c) => c.id === spot.cityId);
            const activeCount = spot.raidIds.filter((id) => {
              const raid = byId.get(id);
              return raid && Date.parse(raid.startsAt) <= now.getTime();
            }).length;
            const isSelected = selected?.id === spot.id && selected.radiusKm === radiusKm;
            return (
              <li key={spot.id} className="raid-hotspot-card" data-selected={isSelected}>
                <div className="raid-hotspot-top">
                  <span className="raid-hotspot-rank">{index + 1}위</span>
                  <span><MapPin size={12} /> {city?.name ?? spot.cityId}</span>
                </div>
                <h4>{spot.gymName} 주변</h4>
                <div className="raid-hotspot-count"><strong>{spot.count}</strong><span>개 <small>반경 {radiusKm}km</small></span></div>
                <p>진행 {activeCount} · 대기 {spot.count - activeCount}</p>
                <small className="raid-hotspot-coordinates">{spot.lat},{spot.lon}</small>
                <div className="raid-hotspot-actions">
                  <CoordinateCopyButton lat={spot.lat} lon={spot.lon} name={`${spot.gymName} 주변 중심`} />
                  <button type="button" className="raid-hotspot-view" aria-pressed={isSelected} onClick={() => {
                    onSelect({ id: spot.id, cityId: spot.cityId, lat: spot.lat, lon: spot.lon, gymName: spot.gymName, radiusKm });
                    requestAnimationFrame(() => document.getElementById("live-gym-results")?.scrollIntoView({ block: "start" }));
                  }}>
                    {isSelected ? "선택한 지역" : "체육관 보기"}<ChevronRight size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="raid-hotspots-empty" role="status">
          {!ready && raids.length ? <><RefreshCw size={18} className="spinning" /> 반경별 레이드 수를 계산하고 있어요.</> : result.error && ready ? "지역을 계산하지 못했습니다. 반경을 바꿔 다시 확인하세요." : "선택한 조건에 맞는 레이드가 없어요."}
        </div>
      )}
      <p className="raid-hotspots-coverage">연결된 도시의 수집 자료 내 비교 · 조회 상한에 따른 일부 결과일 수 있어요. 실제 참여 인원 수는 제공되지 않습니다.</p>
    </section>
  );
}

export function RaidRegionSummary({ region, raids, now, onClear }: {
  region: RaidRegion;
  raids: LiveRaid[];
  now: Date;
  onClear: () => void;
}) {
  const rad = Math.PI / 180;
  return (
    <div className="raid-region-summary">
      <div className="raid-radius-diagram">
        <svg viewBox="0 0 260 260" role="img" aria-label={`선택한 중심 반경 ${region.radiusKm}km 안 체육관 ${raids.length}개의 위치 분포`}>
          <circle cx="130" cy="130" r="112" className="raid-radius-disc" />
          <circle cx="130" cy="130" r="56" className="raid-radius-inner" />
          <path d="M18 130h224M130 18v224" className="raid-radius-axis" />
          <text x="130" y="12" textAnchor="middle">북</text>
          {raids.map((r) => {
            const deltaLon = ((r.lon - region.lon + 540) % 360) - 180;
            const x = 6371.0088 * deltaLon * rad * Math.cos(region.lat * rad);
            const y = 6371.0088 * (r.lat - region.lat) * rad;
            const scale = Math.max(1, Math.hypot(x, y) / region.radiusKm);
            return <circle key={r.id} cx={130 + x * 112 / region.radiusKm / scale} cy={130 - y * 112 / region.radiusKm / scale} r="3.5" className={Date.parse(r.startsAt) <= now.getTime() ? "radius-gym-active" : "radius-gym-upcoming"}><title>{r.gymName} · {r.bossName ?? "보스 미공개"}</title></circle>;
          })}
          <circle cx="130" cy="130" r="5" className="raid-radius-center" />
          <text x="130" y="256" textAnchor="middle">반경 {region.radiusKm}km</text>
        </svg>
        <div className="raid-radius-legend"><span><i className="radius-key-active" />진행</span><span><i className="radius-key-upcoming" />대기</span><span><i className="radius-key-center" />중심</span></div>
      </div>
      <div className="raid-region-copy">
        <span className="mini-label">선택한 지역</span>
        <h3>{region.gymName} 주변</h3>
        <p>반경 {region.radiusKm}km · 현재 조건에 맞는 레이드 <strong>{raids.length}개</strong></p>
        <small>중심에서 직선거리 기준의 체육관 분포예요.</small>
        <div className="raid-region-actions">
          <CoordinateCopyButton lat={region.lat} lon={region.lon} name={`${region.gymName} 주변 중심`} />
          <button type="button" className="raid-region-clear" onClick={onClear}><X size={14} /> 지역 선택 해제</button>
        </div>
      </div>
    </div>
  );
}
