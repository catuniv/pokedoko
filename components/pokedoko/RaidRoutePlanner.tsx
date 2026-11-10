"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, MapPin, RefreshCw, Route, Swords } from "lucide-react";
import type { LiveRaid } from "@/lib/live-raid-types";
import { formatKst } from "@/lib/raid-time";
import {
  buildRaidRoute, isRaidRouteCurrent, raidRouteFilename,
  raidRouteToCoordinates, raidRouteToGpx, type RaidRoute,
} from "@/lib/raid-route";
import type { RaidRegion } from "./RaidHotspots";
import CoordinateCopyButton from "./CoordinateCopyButton";
import RouteExportActions from "./RouteExportActions";
import { useSharedUrlState } from "./ShareButton";
import "./raid-route.css";

type Settings = RaidRoute["settings"];
const DEFAULTS: Settings = { speedKmH: 4.5, stopMinutes: 5, maxStops: 10, durationMinutes: 60 };

function RouteDiagram({ route }: { route: RaidRoute }) {
  const points = [route.region, ...route.stops.map((stop) => stop.raid)];
  const rad = Math.PI / 180;
  const positions = points.map((point) => ({
    x: 6371.0088 * (((point.lon - route.region.lon + 540) % 360) - 180) * rad * Math.cos(route.region.lat * rad),
    y: -6371.0088 * (point.lat - route.region.lat) * rad,
  }));
  const xmin = Math.min(...positions.map((point) => point.x));
  const xmax = Math.max(...positions.map((point) => point.x));
  const ymin = Math.min(...positions.map((point) => point.y));
  const ymax = Math.max(...positions.map((point) => point.y));
  const scale = Math.min(500 / Math.max(0.1, xmax - xmin), 200 / Math.max(0.1, ymax - ymin));
  const plotted = positions.map((point) => ({ x: 280 + (point.x - (xmin + xmax) / 2) * scale, y: 130 + (point.y - (ymin + ymax) / 2) * scale }));
  return <figure className="raid-route-diagram">
    <svg viewBox="0 0 560 260" role="img" aria-label={`출발점에서 체육관 ${route.stops.length}곳을 순서대로 잇는 직선 경로`}>
      <defs><pattern id="raid-route-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="0.5" /></pattern></defs>
      <rect width="560" height="260" rx="14" fill="url(#raid-route-grid)" className="raid-route-grid" />
      <polyline points={plotted.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {plotted.map((point, index) => <g key={index} transform={`translate(${point.x},${point.y})`}>
        <circle r={index ? 12 : 10} className={index ? "raid-route-point" : "raid-route-start"} />
        <text textAnchor="middle" dominantBaseline="central">{index || "출"}</text>
        <title>{index ? `${index}. ${route.stops[index - 1].raid.gymName}` : `출발: ${route.region.gymName}`}</title>
      </g>)}
    </svg>
    <figcaption>숫자는 방문 순서 · 도로 지도와 다른 직선 연결도예요.</figcaption>
  </figure>;
}

export default function RaidRoutePlanner({ region, raids, now, refreshing, onRefresh }: {
  region: RaidRegion;
  raids: LiveRaid[];
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [restored, setRestored] = useState(false);
  useSharedUrlState("live", { routeSpeed: settings.speedKmH, routeStay: settings.stopMinutes, routeStops: settings.maxStops, routeDuration: settings.durationMinutes }, (shared) => {
    setSettings({ speedKmH: shared.routeSpeed ?? 4.5, stopMinutes: shared.routeStay ?? 5, maxStops: shared.routeStops ?? 10, durationMinutes: shared.routeDuration ?? 60 });
    setRestored(true);
  });
  const [route, setRoute] = useState<RaidRoute | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const task = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ raids, region, now, settings });
  latest.current = { raids, region, now, settings };

  function generate() {
    if (task.current) clearTimeout(task.current);
    setBusy(true);
    setError("");
    task.current = setTimeout(() => {
      task.current = null;
      const input = latest.current;
      try { setRoute(buildRaidRoute(input.raids, input.region, input.now, input.settings)); }
      catch { setRoute(null); setError("경로를 만들지 못했어요. 자료를 새로고침한 뒤 다시 시도하세요."); }
      finally { setBusy(false); }
    }, 0);
  }

  useEffect(() => {
    if (restored && !started.current && raids.length) { started.current = true; generate(); }
  });
  useEffect(() => () => { if (task.current) clearTimeout(task.current); task.current = null; started.current = false; }, []);

  const changed = !!route && JSON.stringify(route.settings) !== JSON.stringify(settings);
  const current = !!route && isRaidRouteCurrent(route, raids, now);
  const exportable = !!route && current && !changed && !busy && route.stops.length >= 2;
  const { gpx, coordinates, filename } = useMemo(() => {
    if (route && route.stops.length >= 2) {
      try { return { gpx: raidRouteToGpx(route), coordinates: raidRouteToCoordinates(route), filename: raidRouteFilename(route) }; }
      catch { /* Invalid plans never become downloadable files. */ }
    }
    return { gpx: "", coordinates: "", filename: "pokedoko-route.gpx" };
  }, [route]);
  const canExport = exportable && !!gpx;

  return <section id="raid-route-planner" className="raid-route-planner" aria-labelledby="raid-route-title" aria-busy={busy} tabIndex={-1}>
    <div className="raid-route-heading">
      <div><span className="mini-label"><Route size={14} /> GPX ROUTE</span><h3 id="raid-route-title">레이드 추천 경로</h3><p>{region.gymName} 중심 · 반경 {region.radiusKm}km</p></div>
      <span className="raid-route-badge">현재 보스·도시 선택 적용</span>
    </div>
    <p className="raid-route-explainer">종료 전에 도착하고 머물 수 있는 체육관을 순서대로 이어요. 출발점은 선택한 지역의 중심이에요.</p>
    <a className="raid-route-cell-link" href={`/routes?city=${encodeURIComponent(region.cityId)}`}>지가르데 셀 루트 계획하기 →</a>
    <div className="raid-route-controls">
      <label><span>이동 속도</span><select aria-label="경로 이동 속도" value={settings.speedKmH} onChange={(event) => setSettings((value) => ({ ...value, speedKmH: Number(event.target.value) }))}>
        <option value={4.5}>4.5km/h</option><option value={10}>10km/h</option><option value={20}>20km/h</option>
      </select></label>
      <label><span>체육관당 머무는 시간</span><select aria-label="체육관당 머무는 시간" value={settings.stopMinutes} onChange={(event) => setSettings((value) => ({ ...value, stopMinutes: Number(event.target.value) }))}>
        {[1, 2, 3, 5, 8, 10].map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
      </select></label>
      <label><span>최대 방문 수</span><select aria-label="경로 최대 방문 수" value={settings.maxStops} onChange={(event) => setSettings((value) => ({ ...value, maxStops: Number(event.target.value) }))}>
        {[5, 10, 20].map((count) => <option key={count} value={count}>{count}곳</option>)}
      </select></label>
      <label><span>총 소요 시간 한도</span><select aria-label="경로 소요 시간 한도" value={settings.durationMinutes} onChange={(event) => setSettings((value) => ({ ...value, durationMinutes: Number(event.target.value) }))}>
        {[30, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
      </select></label>
    </div>
    <div className="raid-route-build">
      <button type="button" className="primary-button" onClick={generate} disabled={busy || !raids.length}><RefreshCw size={15} className={busy ? "spinning" : undefined} />{busy ? "계산 중" : route ? "지금 기준으로 다시 만들기" : "추천 경로 만들기"}</button>
      <button type="button" className="text-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "자료 확인 중" : "레이드 자료 새로고침"}</button>
    </div>
    {error && <p className="raid-route-notice" role="alert">{error}</p>}
    {!raids.length && <p className="raid-route-empty" role="status">현재 조건에 맞는 체육관이 없어요. 보스·진행 상태를 바꾸거나 자료를 새로고침하세요.</p>}
    {route && <>
      {changed ? <p className="raid-route-notice" role="status">조건이 바뀌었어요. 경로를 다시 만든 뒤 내보내세요.</p>
        : !current && route.stops.length >= 2 ? <p className="raid-route-notice" role="status">시간이 지났거나 레이드 자료가 바뀌었어요. 현재 기준으로 경로를 다시 만들어 주세요.</p> : null}
      <div className="raid-route-metrics">
        <div><Swords size={16} /><strong>{route.stops.length}<small>곳</small></strong><span>방문 체육관</span></div>
        <div><Route size={16} /><strong>{route.totalDistanceKm.toFixed(2)}<small>km</small></strong><span>직선 이동 거리</span></div>
        <div><Clock3 size={16} /><strong>{Math.ceil(route.totalDurationMinutes)}<small>분</small></strong><span>이동·대기·머무름</span></div>
      </div>
      {route.stops.length >= 2 ? <>
        <RouteDiagram route={route} />
        <div className="raid-route-departure"><MapPin size={16} /><span><strong>출발</strong> {region.gymName} 중심</span><CoordinateCopyButton lat={region.lat} lon={region.lon} name="추천 경로 출발점" city={region.cityId} /></div>
        <ol className="raid-route-stops">
          {route.stops.map((stop, index) => <li key={stop.raid.id}>
            <span className="raid-route-order" aria-hidden="true">{index + 1}</span>
            <div><h4>{stop.raid.gymName}</h4><p>{stop.raid.bossName ?? "알 · 보스 미공개"}</p><small>도착 {formatKst(new Date(stop.arrivalAt))} · 이전 지점에서 {stop.legDistanceKm.toFixed(2)}km</small>{new Date(stop.beginAt).getTime() - new Date(stop.arrivalAt).getTime() >= 60_000 && <small>시작 대기 약 {Math.ceil((Date.parse(stop.beginAt) - Date.parse(stop.arrivalAt)) / 60_000)}분 포함</small>}<small>레이드 종료 {formatKst(new Date(stop.raid.endsAt))}</small></div>
            <CoordinateCopyButton lat={stop.raid.lat} lon={stop.raid.lon} name={`${index + 1}번째 ${stop.raid.gymName}`} city={region.cityId} />
          </li>)}
        </ol>
      </> : <p className="raid-route-empty" role="status">시간 조건을 만족하는 체육관이 {route.stops.length}곳이라 연결 경로를 만들 수 없어요. 시작 대기를 포함하거나 반경·보스·이동 속도·머무는 시간을 바꿔보세요.</p>}
      <RouteExportActions gpx={gpx} coordinates={coordinates} filename={filename} disabled={!canExport} />
      <p className="raid-route-generated">{formatKst(new Date(route.generatedAt))} 기준 · 2분이 지나거나 자료가 바뀌면 다시 계산해요.</p>
      {route.candidateCount > route.cappedCandidateCount && <p className="raid-route-generated">조건에 맞는 {route.candidateCount}곳 중 가까운 곳과 종료가 임박한 곳 {route.cappedCandidateCount}곳을 비교했어요.</p>}
    </>}
    <p className="raid-route-method">직선 좌표를 연결한 추천안으로 실제 도로·통행 가능 여부를 반영하지 않아요. 이동 시간과 종료 1분 전까지의 머무는 시간을 계산하며, 참여 인원·공략 성공은 보장하지 않아요. GPX에는 출발점과 방문 순서가 들어가요.</p>
  </section>;
}
