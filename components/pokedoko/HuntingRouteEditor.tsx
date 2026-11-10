"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { useEffect, useId, useMemo, useState } from "react";
import { Clock3, Footprints, Gauge, RefreshCw, Repeat2, Route, Share2 } from "lucide-react";
import { buildHuntingGpx, buildHuntingRoute, huntingCoordinates, speedKmhFrom, speedToUnit, type HuntingPoint, type HuntingRoutePlan, type HuntingRouteSource } from "@/lib/hunting-route";
import type { HuntingEditorSettings } from "@/lib/hunting-settings";
import RouteExportActions from "./RouteExportActions";
import "./hunting-editor.css";

type Props = {
  points: HuntingPoint[];
  name: string;
  settings: HuntingEditorSettings;
  onChange: (patch: Partial<HuntingEditorSettings>) => void;
  source?: HuntingRouteSource;
  onShare?: (effectiveSettings?: HuntingEditorSettings) => void;
};
type SpeedDraft = { value: string; speedKmh: number; unit: HuntingEditorSettings["speedUnit"] };
const speedText = (settings: HuntingEditorSettings) => String(speedToUnit(settings.speedKmh, settings.speedUnit));
const shortNumber = (value: number, digits = 2) => value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
const kstTime = (value: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);

function durationText(minutes: number): string {
  const rounded = Math.max(0, Math.ceil(minutes));
  if (rounded < 60) return `${rounded}분`;
  const hours = Math.floor(rounded / 60), rest = rounded % 60;
  return `${hours}시간${rest ? ` ${rest}분` : ""}`;
}

/** Display-only equirectangular projection, with continuous longitudes across the date line. */
function HuntingDiagram({ plan }: { plan: HuntingRoutePlan }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const projection = useMemo(() => {
    const count = plan.points.length, shown = Math.min(900, count);
    const indices = new Set(Array.from({ length: shown }, (_, index) => Math.round(index * (count - 1) / Math.max(1, shown - 1))));
    const first = plan.points[0], longitudeScale = Math.cos(first.lat * Math.PI / 180);
    const sampled: { x: number; y: number }[] = [];
    let previousLon = first.lon, longitude = 0, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let index = 0; index < count; index++) {
      const point = plan.points[index];
      const delta = ((point.lon - previousLon + 540) % 360) - 180;
      longitude += delta; previousLon = point.lon;
      const position = { x: longitude * longitudeScale, y: first.lat - point.lat };
      xmin = Math.min(xmin, position.x); xmax = Math.max(xmax, position.x); ymin = Math.min(ymin, position.y); ymax = Math.max(ymax, position.y);
      if (indices.has(index)) sampled.push(position);
    }
    const width = xmax - xmin, height = ymax - ymin;
    const scale = Math.min(width > 0 ? 496 / width : Infinity, height > 0 ? 216 / height : Infinity);
    const safeScale = Number.isFinite(scale) ? scale : 1;
    return sampled.map(point => ({ x: 280 + (point.x - (xmin + xmax) / 2) * safeScale, y: 136 + (point.y - (ymin + ymax) / 2) * safeScale }));
  }, [plan.points]);
  const start = projection[0], end = projection[projection.length - 1];
  const closed = start.x === end.x && start.y === end.y;
  return <LanguageScope>{<figure className="hunting-diagram">
    <svg viewBox="0 0 560 272" role="img" aria-label={`${plan.sourcePointCount.toLocaleString("ko-KR")}개 원본 좌표를 연결한 경로 미리보기`}>
      <defs><pattern id={`${id}-grid`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="0.6" /></pattern></defs>
      <rect width="560" height="272" rx="16" fill={`url(#${id}-grid)`} className="hunting-diagram-grid" />
      <polyline points={projection.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {!closed && <g transform={`translate(${end.x},${end.y})`}><circle r="10" className="hunting-diagram-end" /><text textAnchor="middle" dominantBaseline="central">끝</text><title>마지막 좌표</title></g>}
      <g transform={`translate(${start.x},${start.y})`}><circle r="12" className="hunting-diagram-start" /><text textAnchor="middle" dominantBaseline="central">출</text><title>{closed ? "출발·도착 좌표" : "출발 좌표"}</title></g>
    </svg>
    <figcaption>출: 출발{closed ? "·도착" : " / 끝: 마지막 좌표"} · 도로 지도가 아닌 좌표 연결도입니다.{plan.points.length > 900 && " 미리보기만 최대 900개 점으로 표시하며 내보내기는 모든 좌표를 유지합니다."}</figcaption>
  </figure>}</LanguageScope>;
}

export default function HuntingRouteEditor({ points, name, settings, onChange, source, onShare }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<SpeedDraft>(() => ({ value: speedText(settings), speedKmh: settings.speedKmh, unit: settings.speedUnit }));
  const [clockVersion, setClockVersion] = useState(0);
  // A changed selection receives a new planned departure; normal control edits keep it stable.
  const startAt = useMemo(() => new Date(), [points, clockVersion]);
  const rawSpeed = draft.speedKmh === settings.speedKmh && draft.unit === settings.speedUnit ? draft.value : speedText(settings);
  useEffect(() => {
    setDraft({ value: speedText(settings), speedKmh: settings.speedKmh, unit: settings.speedUnit });
  }, [settings.speedKmh, settings.speedUnit]);

  const currentSpeed = useMemo(() => {
    const text = rawSpeed.trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    const value = speedKmhFrom(numeric, settings.speedUnit);
    return Number.isFinite(value) && value >= 0.1 && value <= 120 ? value : null;
  }, [rawSpeed, settings.speedUnit]);

  const built = useMemo(() => {
    if (currentSpeed === null) return { plan: null, lapDistanceKm: 0, error: "속도는 0.1~120km/h 범위로 입력하세요. m/s 입력은 km/h로 환산합니다." };
    try {
      const options = { speedKmh: currentSpeed, laps: settings.laps, mode: settings.mode, reverse: settings.reverse, includeTimes: settings.includeTimes, startAt };
      const plan = buildHuntingRoute(points, options);
      const lap = settings.laps === 1 ? plan : buildHuntingRoute(points, { ...options, laps: 1, includeTimes: false });
      return { plan, lapDistanceKm: lap.distanceKm, error: "" };
    } catch (error) { return { plan: null, lapDistanceKm: 0, error: error instanceof Error ? error.message : "경로를 만들지 못했습니다. 좌표와 설정을 확인하세요." }; }
  }, [points, currentSpeed, settings.laps, settings.mode, settings.reverse, settings.includeTimes, startAt]);

  const exported = useMemo(() => {
    if (!built.plan) return { gpx: "", coordinates: "", error: "" };
    try { return { gpx: buildHuntingGpx(built.plan, name, settings.format, source), coordinates: huntingCoordinates(built.plan), error: "" }; }
    catch (error) { return { gpx: "", coordinates: "", error: error instanceof Error ? error.message : "GPX를 만들지 못했습니다." }; }
  }, [built.plan, name, settings.format, source?.url, source?.title, source?.author]);
  const error = built.error || exported.error;
  const valid = !!built.plan && !!exported.gpx && !error;
  const filename = `${name || "pokedoko-hunting"}-${currentSpeed === null ? "speed" : Number(currentSpeed.toFixed(6))}kmh-${settings.laps}laps.gpx`;

  function setSpeedDraft(value: string) {
    setDraft({ value, speedKmh: settings.speedKmh, unit: settings.speedUnit });
  }
  function commitSpeed() {
    if (currentSpeed !== null && currentSpeed !== settings.speedKmh) onChange({ speedKmh: currentSpeed });
  }
  function preset(speedKmh: number) {
    const next = { ...settings, speedKmh };
    setDraft({ value: speedText(next), speedKmh, unit: settings.speedUnit });
    onChange({ speedKmh });
  }
  function changeUnit(unit: HuntingEditorSettings["speedUnit"]) {
    if (currentSpeed === null) return;
    onChange({ speedKmh: currentSpeed, speedUnit: unit });
  }

  return <LanguageScope>{<section className="hunting-editor" aria-labelledby={`${id}-title`}>
    <div className="hunting-editor-heading"><div><span className="mini-label"><Route size={14} aria-hidden="true" /> GPX 설정</span><h2 id={`${id}-title`}>{name ? <span data-i18n-preserve>{name}</span> : "사냥 경로"}</h2></div><span className="hunting-editor-count">경로 {points.length.toLocaleString("ko-KR")}개 좌표</span></div>
    <fieldset className="hunting-speed"><legend><Gauge size={16} aria-hidden="true" />이동 속도</legend>
      <div className="hunting-speed-presets">
        {[{ value: 9.3, label: "걷기" }, { value: 15, label: "순회" }, { value: 20, label: "빠른 순회" }].map(presetValue => <button key={presetValue.value} type="button" aria-pressed={currentSpeed !== null && Math.abs(currentSpeed - presetValue.value) < 1e-8} onClick={() => preset(presetValue.value)}><span>{presetValue.label}</span><strong>{presetValue.value}<small> km/h</small></strong></button>)}
      </div>
      <div className="hunting-speed-input-row">
        <label htmlFor={`${id}-speed`}>직접 입력<div className="hunting-speed-input"><input id={`${id}-speed`} type="text" inputMode="decimal" autoComplete="off" value={rawSpeed} aria-invalid={currentSpeed === null} aria-describedby={currentSpeed === null ? `${id}-error` : `${id}-unit-note`} onChange={event => setSpeedDraft(event.target.value)} onBlur={commitSpeed} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitSpeed(); event.currentTarget.blur(); } }} /><span>{settings.speedUnit === "kmh" ? "km/h" : "m/s"}</span></div></label>
        <label htmlFor={`${id}-unit`}>입력 단위<select id={`${id}-unit`} value={settings.speedUnit} disabled={currentSpeed === null} onChange={event => changeUnit(event.target.value as HuntingEditorSettings["speedUnit"])}><option value="kmh">km/h</option><option value="mps">m/s</option></select></label>
      </div>
      <p className="hunting-editor-hint" id={`${id}-unit-note`}>1m/s = 3.6km/h{currentSpeed !== null && settings.speedUnit === "mps" ? ` · 현재 ${shortNumber(currentSpeed, 4)}km/h` : ""}</p>
    </fieldset>

    <div className="hunting-editor-controls">
      <label htmlFor={`${id}-mode`}><span>경로 방식</span><select id={`${id}-mode`} value={settings.mode} onChange={event => onChange({ mode: event.target.value as HuntingEditorSettings["mode"] })}><option value="original">원본 그대로</option><option value="loop">출발점 연결</option><option value="out-and-back">왕복</option></select></label>
      <label htmlFor={`${id}-laps`}><span>반복 횟수</span><select id={`${id}-laps`} value={settings.laps} onChange={event => onChange({ laps: Number(event.target.value) })}>{Array.from({ length: 20 }, (_, index) => index + 1).map(laps => <option key={laps} value={laps}>{laps}회</option>)}</select></label>
      <label htmlFor={`${id}-format`}><span>GPX 형식</span><select id={`${id}-format`} value={settings.format} onChange={event => onChange({ format: event.target.value as HuntingEditorSettings["format"] })}><option value="trk">트랙 (trk)</option><option value="rte">경로 (rte)</option></select></label>
    </div>
    <div className="hunting-editor-checks">
      <label><input type="checkbox" checked={settings.reverse} onChange={event => onChange({ reverse: event.target.checked })} /><Repeat2 size={16} aria-hidden="true" /><span>진행 방향 뒤집기</span></label>
      <label><input type="checkbox" checked={settings.includeTimes} onChange={event => onChange({ includeTimes: event.target.checked })} /><Clock3 size={16} aria-hidden="true" /><span>GPX에 계획 시각 넣기</span></label>
    </div>
    {settings.includeTimes && <div className="hunting-planned-time"><span>예정 출발 · {kstTime(startAt)} KST</span><button type="button" onClick={() => setClockVersion(version => version + 1)}><RefreshCw size={14} aria-hidden="true" />예정시각 갱신</button><p>설정한 속도로 계산한 예정 시각입니다. 실제 이동 기록이 아닙니다.</p></div>}
    {error && <p className="hunting-editor-error" id={`${id}-error`} role="alert">{error}</p>}
    {built.plan && <>
      <div className="hunting-editor-metrics">
        <div><Route size={17} aria-hidden="true" /><strong>{shortNumber(built.plan.distanceKm)}<small> km</small></strong><span>총 거리 · 1회 {shortNumber(built.lapDistanceKm)}km</span></div>
        <div><Clock3 size={17} aria-hidden="true" /><strong>{durationText(built.plan.durationMinutes)}</strong><span>정차 시간 제외</span></div>
        <div><Footprints size={17} aria-hidden="true" /><strong>{built.plan.points.length.toLocaleString("ko-KR")}<small>개</small></strong><span>내보낼 좌표 · {built.plan.laps}회</span></div>
      </div>
      <HuntingDiagram plan={built.plan} />
    </>}
    <RouteExportActions gpx={valid ? exported.gpx : ""} coordinates={valid ? exported.coordinates : ""} filename={filename} disabled={!valid} />
    {onShare && <button type="button" className="hunting-share-button" disabled={!valid || currentSpeed === null} onClick={() => { if (!valid || currentSpeed === null) return; commitSpeed(); onShare({ ...settings, speedKmh: currentSpeed }); }}><Share2 size={15} aria-hidden="true" />이 설정으로 링크 공유</button>}
    <p className="hunting-app-speed-note">PolygonX에서도 같은 이동 속도를 설정하세요. GPX 시간 정보를 읽지 않는 앱은 앱의 속도 설정을 따라요.</p>
    <p className="hunting-editor-hint">거리와 시간은 좌표 연결 기준이며 실제 도로와 앱의 정차 시간은 반영하지 않아요.</p>
  </section>}</LanguageScope>;
}
