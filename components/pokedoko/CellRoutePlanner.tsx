"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, FileUp, MapPin, Plus, Route, Trash2 } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { CELL_ROUTE_MAX_BYTES, CELL_ROUTE_MAX_ROUTES, cellLocalDay, cellPathKm, cellPlanCoordinates, cellPlanGpx, cellSourceUrl, parseCellCoordinateLines, parseCellGpx, planCellRoutes, restoreCellState, type CellCompletion, type CellPoint, type CellRoute, type CellRoutePlan } from "@/lib/cell-routes";
import type { CommunityRouteDetail } from "@/lib/community-routes";
import CommunityRouteDirectory from "./CommunityRouteDirectory";
import RouteExportActions from "./RouteExportActions";
import "./cell-route.css";

const STORAGE_KEY = "pokedoko.cell-routes.v1";
const CITY_IDS = CITIES.map((city) => city.id);
const OFFICIAL_UPDATE = "https://pokemongo.com/en/news/pgo-gameplay-update-oct-2026";
const ROUTES_HELP = "https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/1216-what-are-routes/";
const ROUTES_FAQ = "https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/1220-routes-faq/";
const km = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}km`;

function RouteDiagram({ plan }: { plan: CellRoutePlan }) {
  const points = plan.steps.flatMap((step) => step.points);
  if (!points.length) return null;
  const origin = points[0], cosine = Math.max(.01, Math.cos(origin.lat * Math.PI / 180));
  const projected = (p: CellPoint) => ({ x: (((p.lon - origin.lon + 540) % 360) - 180) * cosine, y: -p.lat });
  const positions = points.map(projected), minX = Math.min(...positions.map((p) => p.x)), maxX = Math.max(...positions.map((p) => p.x)), minY = Math.min(...positions.map((p) => p.y)), maxY = Math.max(...positions.map((p) => p.y));
  const fit = Math.min(maxX > minX ? 610 / (maxX - minX) : Infinity, maxY > minY ? 240 / (maxY - minY) : Infinity);
  const scale = Number.isFinite(fit) ? fit : 1;
  const point = (p: CellPoint) => { const v = projected(p); return { x: 330 + (v.x - (minX + maxX) / 2) * scale, y: 144 + (v.y - (minY + maxY) / 2) * scale }; };
  return <figure className="cell-route-diagram">
    <svg viewBox="0 0 660 290" role="img" aria-label={`등록한 경로 ${plan.steps.length}개의 방문 순서도. 점선은 경로 사이 이동입니다.`}>
      {plan.steps.map((step, index) => {
        const start = point(step.points[0]), previous = index ? point(plan.steps[index - 1].points.at(-1)!) : null;
        return <g key={step.route.id}>
          {previous && <line x1={previous.x} y1={previous.y} x2={start.x} y2={start.y} className="cell-route-transfer" />}
          <polyline points={step.points.map((p) => { const v = point(p); return `${v.x},${v.y}`; }).join(" ")} className="cell-route-line" />
          <circle cx={start.x} cy={start.y} r="12" className="cell-route-start" /><text x={start.x} y={start.y + 4} textAnchor="middle">{index + 1}</text>
        </g>;
      })}
    </svg>
    <figcaption>실선: 등록한 경로 · 점선: 경로 사이 직선거리 · 실제 도로 안내가 아닙니다</figcaption>
  </figure>;
}

function IndividualRouteBackup({ route }: { route: CellRoute }) {
  const [open, setOpen] = useState(false);
  const payload = useMemo(() => {
    if (!open) return null;
    const walkKm = cellPathKm(route.points);
    const plan: CellRoutePlan = { steps: [{ route, points: route.points, reversed: false, walkKm, transferKm: 0 }], walkKm, transferKm: 0, totalKm: walkKm, estimatedMinutes: walkKm / 4.5 * 60 };
    return { gpx: cellPlanGpx(plan), coordinates: cellPlanCoordinates(plan) };
  }, [open, route]);
  return <details className="cell-single-export" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>이 루트 개별 GPX 보관</summary><p>원래 좌표 순서의 경로 1개입니다. 다른 기기에서 파일을 불러와 이름과 도시를 지정하세요.</p>{payload && <RouteExportActions gpx={payload.gpx} coordinates={payload.coordinates} filename={`pokedoko-${route.cityId}-${route.name}`} />}</details>;
}

export default function CellRoutePlanner() {
  const [routes, setRoutes] = useState<CellRoute[]>([]), [completions, setCompletions] = useState<CellCompletion[]>([]);
  const [storageWritable, setStorageWritable] = useState(true), [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false), [now, setNow] = useState<Date | null>(null);
  const [cityId, setCityId] = useState("seoul"), [limit, setLimit] = useState<3 | 5>(3), [excludeDone, setExcludeDone] = useState(true);
  const [format, setFormat] = useState<"gpx" | "coordinates">("gpx"), [raw, setRaw] = useState("");
  const [name, setName] = useState(""), [routeCity, setRouteCity] = useState(""), [source, setSource] = useState(""), [reversible, setReversible] = useState(false);
  const [error, setError] = useState(""), [storageNotice, setStorageNotice] = useState(""), [notice, setNotice] = useState("");
  const fileRequest = useRef(0);
  const [completionError, setCompletionError] = useState("");
  const [gpxFormat, setGpxFormat] = useState<"trk" | "rte">("trk"), [cellInputs, setCellInputs] = useState<Record<string, string>>({});
  const city = CITIES.find((item) => item.id === cityId) ?? CITIES[0];
  const day = now ? cellLocalDay(now, city.zone) : "";
  useEffect(() => {
    setNow(new Date());
    const queryCity = new URLSearchParams(location.search).get("city");
    if (queryCity && CITY_IDS.includes(queryCity)) setCityId(queryCity);
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (text && text.length > 4_194_304) throw new Error();
      const parsed = text ? JSON.parse(text) : null;
      if (text && (!parsed || parsed.version !== 1 || !Array.isArray(parsed.routes) || parsed.routes.length > CELL_ROUTE_MAX_ROUTES || parsed.completions !== undefined && !Array.isArray(parsed.completions))) throw new Error();
      const saved = restoreCellState(parsed, CITY_IDS);
      setRoutes(saved.routes); setCompletions(saved.completions);
      if (text && (saved.routes.length !== parsed.routes.length || saved.completions.length !== (parsed.completions?.length ?? 0))) {
        setStorageWritable(false);
        setStorageNotice("저장본 일부를 읽지 못해 기존 내용은 바꾸지 않았어요. 현재 탭의 경로는 각 루트 카드에서 개별 GPX로 보관해 주세요.");
      }
    } catch {
      setStorageWritable(false);
      setStorageNotice("기기의 저장본을 읽지 못해 기존 내용은 바꾸지 않았어요. 현재 탭에서 등록한 경로는 각 루트 카드에서 개별 GPX로 보관해 주세요.");
    }
    setReady(true);
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => { clearInterval(timer); fileRequest.current++; };
  }, []);
  useEffect(() => {
    if (!ready || !storageWritable || !dirty) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, routes, completions })); setStorageNotice(""); }
    catch { setStorageNotice("브라우저 저장이 제한되어 현재 탭에만 남아요. 각 루트 카드에서 개별 GPX로 보관해 주세요."); }
  }, [ready, storageWritable, dirty, routes, completions]);
  const todayRecords = useMemo(() => completions.filter((record) => record.cityId === cityId && record.day === day), [completions, cityId, day]);
  const excluded = useMemo(() => new Set(excludeDone ? todayRecords.map((record) => record.routeId) : []), [excludeDone, todayRecords]);
  const plan = useMemo(() => planCellRoutes(routes, cityId, limit, excluded), [routes, cityId, limit, excluded]);
  const localRoutes = routes.filter((route) => route.cityId === cityId);
  const gpx = useMemo(() => cellPlanGpx(plan, gpxFormat), [plan, gpxFormat]);

  function selectCity(next: string) {
    if (!CITY_IDS.includes(next)) return;
    setCityId(next);
    const url = new URL(location.href);
    url.searchParams.set("city", next);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function importPublicRoute(route: CommunityRouteDetail): string | null {
    if (!ready) return "기기 저장본을 읽는 중이에요. 잠시 후 다시 눌러 주세요.";
    if (!storageWritable) return "기기 저장본을 읽지 못했어요. 기존 경로를 GPX로 보관한 뒤 저장본을 다시 읽어 주세요.";
    if (!route.gpxAvailable || route.geometryType !== "original" || !route.points || route.points.length < 2) return "방문 계획에 추가할 원본 전체 경로가 없습니다.";
    if (routes.length >= CELL_ROUTE_MAX_ROUTES) return "기기에 경로 20개까지 등록할 수 있어요. 기존 경로를 지운 뒤 추가해 주세요.";
    const id = `community-${route.id}`;
    if (routes.some((item) => item.id === id || item.cityId === route.cityId && item.name === route.name && JSON.stringify(item.points) === JSON.stringify(route.points))) return "이미 이 기기에 추가한 루트예요.";
    const imported: CellRoute = { id, name: route.name, cityId: route.cityId, points: route.points.map((point) => ({ ...point })), reversible: false, sourceUrl: route.sourceUrl, createdAt: new Date().toISOString() };
    setDirty(true); setRoutes((current) => [...current, imported]); selectCity(route.cityId);
    return null;
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    const request = ++fileRequest.current;
    setError(""); setNotice("");
    if (file.size > CELL_ROUTE_MAX_BYTES) { setError("파일은 1MiB 이하만 불러올 수 있어요."); return; }
    try {
      const text = await file.text();
      if (request !== fileRequest.current) return;
      parseCellGpx(text);
      setRaw(text); setFormat("gpx");
      setName((current) => current.trim() ? current : file.name.replace(/\.gpx$/i, "").slice(0, 80));
      setNotice("파일을 읽었어요. 이름과 도시를 확인한 뒤 등록하세요.");
    } catch (failure) { if (request === fileRequest.current) setError(failure instanceof Error ? failure.message : "파일을 읽지 못했어요."); }
  }
  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); fileRequest.current++; setError(""); setNotice("");
    try {
      if (routes.length >= CELL_ROUTE_MAX_ROUTES) throw new Error("기기에 경로 20개까지 등록할 수 있어요. 기존 경로를 지운 뒤 추가해 주세요.");
      if (!name.trim() || name.trim().length > 80 || /[\u0000-\u001f\u007f]/u.test(name) || !CITY_IDS.includes(routeCity)) throw new Error("경로 이름과 도시를 확인해 주세요.");
      const points = format === "gpx" ? parseCellGpx(raw) : parseCellCoordinateLines(raw);
      const sourceUrl = cellSourceUrl(source);
      if (routes.some((route) => route.cityId === routeCity && route.name === name.trim() && JSON.stringify(route.points) === JSON.stringify(points))) throw new Error("같은 이름과 좌표의 경로가 이미 등록되어 있어요.");
      const route: CellRoute = { id: crypto.randomUUID(), name: name.trim(), cityId: routeCity, points, reversible, sourceUrl, createdAt: new Date().toISOString() };
      setDirty(true); setRoutes((items) => [...items, route]); selectCity(routeCity); setRaw(""); setName(""); setSource(""); setReversible(false);
      setNotice("경로를 이 기기에 등록했어요. 게임 내 루트 여부는 직접 확인해 주세요.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "경로를 등록하지 못했어요."); }
  }
  function markComplete(route: CellRoute) {
    setCompletionError("");
    const recordedAt = new Date(), recordDay = cellLocalDay(recordedAt, city.zone);
    setNow(recordedAt);
    const count = Number(cellInputs[route.id] ?? completions.find((record) => record.routeId === route.id && record.day === recordDay)?.cells ?? 0);
    if (!Number.isSafeInteger(count) || count < 0 || count > 999) { setCompletionError("기록할 셀 수는 0~999 사이 정수로 넣어주세요."); return; }
    setDirty(true);
    setCompletions((records) => [...records.filter((record) => !(record.routeId === route.id && record.day === recordDay)), { routeId: route.id, cityId, day: recordDay, cells: count, completedAt: recordedAt.toISOString() }].slice(-500));
  }
  function undoComplete(route: CellRoute) {
    const current = new Date(), recordDay = cellLocalDay(current, city.zone);
    setNow(current); setDirty(true);
    setCompletions((records) => records.filter((record) => !(record.routeId === route.id && record.day === recordDay)));
  }
  function remove(route: CellRoute) {
    setDirty(true);
    setRoutes((items) => items.filter((item) => item.id !== route.id));
    setCompletions((records) => records.filter((record) => record.routeId !== route.id));
  }
  return <div className="cell-routes-page">
    <header className="cell-routes-top"><a href="/live" className="cell-routes-brand">poke<strong>doko</strong></a><nav aria-label="주요 메뉴"><a href="/live">실시간 레이드</a><a href="/calendar">이벤트 달력</a><a href="/gpx">GPX 자동사냥</a><a href="/routes" aria-current="page">셀 루트 계획</a></nav></header>
    <main className="cell-routes-main">
      <section className="cell-routes-heading"><span className="cell-eyebrow"><Route size={15} /> POKÉMON GO ROUTES</span><h1>지가르데 셀 루트 목록</h1><p>지역별 게임 루트를 확인하고, 전체 경로가 있는 루트는 GPX로 내려받으세요.</p><div className="cell-route-source-status"><span>사용자 제보 · 검토 후 공개</span><p>공유 허락과 게임 루트 정보를 확인한 제보를 모아요. 파밍용 GPX는 게임 루트 목록에 등록하지 않습니다.</p></div></section>
      <CommunityRouteDirectory cityId={cityId} onCityChange={selectCity} onImport={importPublicRoute} />
      <details className="cell-routes-help"><summary>셀 획득 기준과 게임 루트 확인</summary><p>지가르데 셀은 루트를 완료하면 보상으로 받습니다. 지도에서 직접 누르지 않아도 되며, 모든 루트에서 획득하는 것은 아니에요.</p><p>GPX 파일만으로 게임 루트를 시작하거나 셀을 받을 수는 없어요. Pokémon GO에서 승인된 루트를 고르고 시작점에서 ‘따라가기’를 시작하세요. 파일의 이름·방향·경로가 같은지 확인해 주세요.</p><div><a href="https://campfire.nianticlabs.com/" target="_blank" rel="noreferrer">Campfire에서 확인 <ArrowUpRight size={13} /></a><a href={ROUTES_HELP} target="_blank" rel="noreferrer">공식 루트 안내</a><a href={ROUTES_FAQ} target="_blank" rel="noreferrer">공식 FAQ</a><a href={OFFICIAL_UPDATE} target="_blank" rel="noreferrer">셀 자동 지급 공지</a></div></details>
      {storageNotice && <div className="cell-storage-notice" role="status"><p>{storageNotice}</p>{!storageWritable && <button type="button" onClick={() => location.reload()}>저장본 다시 읽기</button>}</div>}
      <section className="cell-route-panel" aria-labelledby="cell-import-heading"><div className="cell-panel-title"><h2 id="cell-import-heading">개인 GPX 등록</h2><span>{routes.length}/20개 · 기기 저장</span></div>
        <form onSubmit={register}>
          <div className="cell-form-row"><label>루트 이름<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="게임에서 확인한 이름" /></label><label>도시<select required value={routeCity} onChange={(event) => setRouteCity(event.target.value)}><option value="">도시를 선택하세요</option>{CITIES.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.country}</option>)}</select></label></div>
          <div className="cell-input-options" role="group" aria-label="경로 입력 형식"><button type="button" aria-pressed={format === "gpx"} onClick={() => { fileRequest.current++; setFormat("gpx"); }}>GPX 파일·붙여넣기</button><button type="button" aria-pressed={format === "coordinates"} onClick={() => { fileRequest.current++; setFormat("coordinates"); }}>좌표 목록</button></div>
          {format === "gpx" && <label className="cell-file-label"><FileUp size={16} /><span>GPX 파일 불러오기 <small>1MiB · 좌표 2,000개 이하</small></span><input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}
          <label className="cell-raw-label">{format === "gpx" ? "GPX 내용" : "위도,경도 · 한 줄에 하나씩"}<textarea required rows={5} maxLength={CELL_ROUTE_MAX_BYTES} value={raw} onChange={(event) => { fileRequest.current++; setRaw(event.target.value); }} placeholder={format === "gpx" ? "GPX XML을 붙여넣거나 위에서 파일을 선택하세요." : "위도,경도 형식으로 경로 전체를 순서대로 넣어주세요."} spellCheck={false} /></label>
          <label className="cell-source-label">확인할 원문 주소 <span>선택</span><input type="url" maxLength={2048} value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://" /></label>
          <label className="cell-checkbox"><input type="checkbox" checked={reversible} onChange={(event) => setReversible(event.target.checked)} /><span>게임에서 역방향도 허용한 루트예요 <small>직접 확인한 경우에만 선택하세요</small></span></label>
          {error && <p className="cell-form-error" role="alert">{error}</p>}{notice && <p className="cell-form-notice" role="status">{notice}</p>}
          <button type="submit" className="cell-primary-button" disabled={!ready || routes.length >= CELL_ROUTE_MAX_ROUTES}><Plus size={16} />이 기기에 등록</button>
        </form>
      </section>
      <section className="cell-route-panel" aria-labelledby="cell-plan-heading"><div className="cell-panel-title"><h2 id="cell-plan-heading">방문 순서</h2><span><MapPin size={14} /> {city.name}</span></div>
        <div className="cell-plan-controls"><label>도시<select aria-label="셀 루트 도시" value={cityId} onChange={(event) => selectCity(event.target.value)}>{CITIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>최대 경로 수<select aria-label="최대 방문 경로 수" value={limit} onChange={(event) => setLimit(Number(event.target.value) as 3 | 5)}><option value={3}>3개</option><option value={5}>5개</option></select></label><label className="cell-checkbox"><input type="checkbox" checked={excludeDone} onChange={(event) => setExcludeDone(event.target.checked)} /><span>오늘 완료한 루트 제외</span></label></div>
        <p className="cell-plan-description">각 루트의 좌표 순서는 유지하고, 경로 거리와 구간 사이 직선거리의 합을 줄이는 순서를 비교해요. 역방향은 직접 허용한 루트만 사용합니다.</p>
        {plan.steps.length ? <>
          <div className="cell-plan-summary"><div><span>등록 경로 거리</span><strong>{km(plan.walkKm)}</strong></div><div><span>경로 사이 직선거리</span><strong>{km(plan.transferKm)}</strong></div><div><span>이동 시간 추정</span><strong>{Math.ceil(plan.estimatedMinutes)}분</strong></div></div>
          <p className="cell-estimate-note">시속 4.5km 기준이며 대기·게임 플레이 시간은 포함하지 않아요. 경로 사이 거리는 실제 도보 길이가 아닙니다.</p>
          <RouteDiagram plan={plan} />
          <ol className="cell-plan-list">{plan.steps.map((step, index) => <li key={step.route.id}><span>{index + 1}</span><div><strong>{step.route.name}</strong><small>{step.reversed ? "역방향" : "정방향"} · {km(step.walkKm)} · 좌표 {step.points.length.toLocaleString()}개</small>{index > 0 && <small>이전 루트 끝에서 직선 {km(step.transferKm)}</small>}</div><ChevronRight size={16} /></li>)}</ol>
          <div className="cell-export-heading"><label>GPX 구조<select aria-label="셀 루트 GPX 구조" value={gpxFormat} onChange={(event) => setGpxFormat(event.target.value as "trk" | "rte")}><option value="trk">트랙 (trk)</option><option value="rte">루트 (rte)</option></select></label><p>방문 계획은 여러 루트가 들어 있는 파일입니다. 다시 등록할 보관본은 아래 각 루트 카드에서 개별 GPX로 내보내세요. 루트 사이 이동선은 추가하지 않아요.</p></div>
          <RouteExportActions gpx={gpx} coordinates={cellPlanCoordinates(plan)} filename={`pokedoko-${city.id}-my-routes`} disabled={!plan.steps.length} />
        </> : <div className="cell-plan-empty"><Route size={27} /><h3>{localRoutes.length ? "계획에 넣을 경로가 없어요" : "아직 등록한 경로가 없어요"}</h3><p>{localRoutes.length ? "오늘 완료 제외를 해제하거나 다른 루트를 등록해 주세요." : "위에서 게임에서 확인한 루트의 GPX 또는 좌표를 등록하세요. 예시 경로를 게임 루트로 표시하지 않습니다."}</p></div>}
      </section>
      <section className="cell-route-panel" aria-labelledby="cell-saved-heading"><div className="cell-panel-title"><h2 id="cell-saved-heading">{city.name}에 등록한 루트</h2><span>{localRoutes.length}개</span></div><p className="cell-today-summary">{day || "날짜 확인 중"} · {city.name} 현지 기준 · 완료 기록 {todayRecords.length}개 · 직접 기록한 셀 {todayRecords.reduce((sum, record) => sum + record.cells, 0)}개</p><p className="cell-estimate-note">아래 기록은 게임과 연동되지 않습니다. 실제로 완료한 뒤 받은 셀 수를 직접 적어주세요.</p>
        {completionError && <p className="cell-form-error" role="alert">{completionError}</p>}
        <div className="cell-saved-list">{localRoutes.map((route) => { const done = todayRecords.find((record) => record.routeId === route.id); return <article key={route.id} className="cell-saved-route"><div className="cell-saved-heading"><h3>{route.name}</h3><span className="cell-unverified">게임 루트 미검증</span></div><p>{km(cellPathKm(route.points))} · 좌표 {route.points.length.toLocaleString()}개 · {route.reversible ? "역방향 허용 (직접 확인)" : "정방향만"}</p>{route.sourceUrl && <a className="cell-route-source-link" href={route.sourceUrl} target="_blank" rel="noreferrer">등록한 원문 확인 <ArrowUpRight size={13} /></a>}<div className="cell-completion-row"><label>받은 셀 수<input type="number" inputMode="numeric" min={0} max={999} step={1} value={cellInputs[route.id] ?? String(done?.cells ?? 0)} onChange={(event) => setCellInputs((values) => ({ ...values, [route.id]: event.target.value }))} aria-label={`${route.name} 받은 셀 수`} /></label><button type="button" onClick={() => markComplete(route)}><Check size={14} />{done ? "오늘 기록 수정" : "오늘 완료 기록"}</button>{done && <button type="button" onClick={() => undoComplete(route)}>오늘 기록 취소</button>}<button type="button" className="cell-delete-button" onClick={() => remove(route)} aria-label={`${route.name} 경로 삭제`}><Trash2 size={14} />삭제</button></div>{done && <small className="cell-completed-badge">오늘 완료 · 셀 {done.cells}개 직접 기록</small>}<IndividualRouteBackup route={route} /></article>; })}</div>
        {!localRoutes.length && <p className="cell-estimate-note">이 도시에 저장된 경로가 없습니다.</p>}
      </section>
      <p className="cell-routes-footer">개인 등록 경로와 완료 기록은 현재 브라우저에만 저장됩니다. 공개 루트 제보는 서버에 보관하며 검토 후 공개합니다. 다른 기기로 개인 경로를 옮길 때는 각 루트 카드에서 개별 GPX로 내보내세요. 방문 계획 파일은 여러 구간이 들어 있어 나눠 등록해야 합니다. 셀 획득 횟수·확률을 예측하거나 보장하지 않습니다.</p>
    </main>
  </div>;
}
