"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, ChevronUp, FileUp, LoaderCircle, MapPin, Plus, RefreshCw, Route, Send, X } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { CELL_ROUTE_MAX_BYTES, cellPathKm, parseCellGpx, type CellPoint } from "@/lib/cell-routes";
import { communityGeometryLabel, communityGpxFilename, type CommunityGeometryType, type CommunityRouteDetail, type CommunityRouteSummary } from "@/lib/community-routes";
import RouteGeometryMap from "./RouteGeometryMap";
import "./community-routes.css";

const SUBMITTER_STORAGE_KEY = "pokedoko.route-submitter.v1";
const distance = (meters: number) => meters >= 1000 ? `${(meters / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })} km` : `${Math.round(meters).toLocaleString("ko-KR")} m`;
const coordinates = (point: CellPoint) => `${point.lat},${point.lon}`;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validPoint = (value: unknown): value is CellPoint => record(value) && typeof value.lat === "number" && typeof value.lon === "number" && Number.isFinite(value.lat) && Number.isFinite(value.lon) && Math.abs(value.lat) <= 90 && Math.abs(value.lon) <= 180;
function validSource(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
function validSummary(value: unknown): value is CommunityRouteSummary {
  if (!record(value)) return false;
  return ["id", "name", "cityId", "startName", "endName", "creatorName", "lastCheckedAt", "publishedAt"].every((key) => typeof value[key] === "string")
    && validPoint(value.startPoint) && (value.endPoint === undefined || validPoint(value.endPoint))
    && typeof value.reportedDistanceMeters === "number" && Number.isFinite(value.reportedDistanceMeters) && value.reportedDistanceMeters > 0
    && (value.computedDistanceMeters === undefined || typeof value.computedDistanceMeters === "number" && Number.isFinite(value.computedDistanceMeters))
    && typeof value.pointCount === "number" && Number.isSafeInteger(value.pointCount) && value.pointCount >= 0 && value.pointCount <= 2000
    && typeof value.gpxAvailable === "boolean" && (value.verificationStatus === "reviewed" || value.verificationStatus === "needs_verification")
    && (value.geometryType === "none" || value.geometryType === "original" || value.geometryType === "estimated" || value.geometryType === "reconstructed") && validSource(value.sourceUrl);
}
function validDetail(value: unknown): value is CommunityRouteDetail {
  if (!record(value)) return false;
  const extra: Record<string, unknown> = value;
  if (!validSummary(value)) return false;
  return typeof extra.rightsDetails === "string" && typeof extra.notes === "string"
    && (extra.rightsBasis === "creator" || extra.rightsBasis === "permission" || extra.rightsBasis === "license")
    && (extra.points === undefined || Array.isArray(extra.points) && extra.points.length >= 2 && extra.points.length <= 2000 && extra.points.every(validPoint))
    && (!value.gpxAvailable || Array.isArray(extra.points) && extra.points.length >= 2);
}
type RouteListResponse = { routes: CommunityRouteSummary[]; total: number; page: number; hasMore: boolean };
function readList(value: unknown): RouteListResponse {
  if (!record(value) || value.ok !== true || !Array.isArray(value.routes) || value.routes.length > 100 || !value.routes.every(validSummary) || typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0 || typeof value.page !== "number" || !Number.isSafeInteger(value.page) || value.page < 1 || typeof value.hasMore !== "boolean") throw new Error("루트 목록 응답을 확인하지 못했어요.");
  return { routes: value.routes, total: value.total, page: value.page, hasMore: value.hasMore };
}
function parsePoint(value: string, label: string): CellPoint {
  const numbers = value.trim().split(",").map((part) => part.trim());
  if (numbers.length !== 2 || numbers.some((part) => !part)) throw new Error(`${label}는 위도,경도 형식으로 입력해 주세요.`);
  const [lat, lon] = numbers.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`${label}의 위도·경도 범위를 확인해 주세요.`);
  return { lat, lon };
}
async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (record(body) && typeof body.message === "string" && body.message.length <= 500) return body.message;
  } catch { /* Keep a useful message when an upstream response is not JSON. */ }
  if (response.status === 429) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  if (response.status === 503) return "루트 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return fallback;
}
function useCoordinateCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy(value: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(value);
      setCopied(value); setFallback(null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2200);
    } catch { setCopied(null); setFallback(value); }
  }
  return { copied, fallback, copy, close: () => setFallback(null) };
}

function PublicRouteCard({ route, onImport }: { route: CommunityRouteSummary; onImport: (route: CommunityRouteDetail) => string | null }) {
  const [open, setOpen] = useState(false), [detail, setDetail] = useState<CommunityRouteDetail | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false), [downloadError, setDownloadError] = useState("");
  const [importNotice, setImportNotice] = useState(""), [importError, setImportError] = useState("");
  const detailRequest = useRef(0);
  const coordinateCopy = useCoordinateCopy();
  useEffect(() => () => { detailRequest.current++; }, []);
  async function loadDetail() {
    const request = ++detailRequest.current;
    setLoading(true); setError("");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/routes/${encodeURIComponent(route.id)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(await responseMessage(response, "루트 상세를 불러오지 못했어요."));
      const body = await response.json();
      if (!record(body) || body.ok !== true || !validDetail(body.route) || body.route.id !== route.id) throw new Error("루트 상세 응답을 확인하지 못했어요.");
      if (request === detailRequest.current) setDetail(body.route);
    } catch (failure) { if (request === detailRequest.current) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "상세 조회 시간이 초과됐어요. 다시 시도해 주세요."); }
    finally { clearTimeout(timer); if (request === detailRequest.current) setLoading(false); }
  }
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) void loadDetail();
  }
  async function download() {
    if (!route.gpxAvailable || downloading) return;
    setDownloading(true); setDownloadError("");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/routes/${encodeURIComponent(route.id)}/gpx`, { signal: controller.signal, headers: { Accept: "application/gpx+xml" } });
      if (!response.ok) throw new Error(await responseMessage(response, "GPX를 내려받지 못했어요. 다시 시도해 주세요."));
      const contentType = response.headers.get("content-type") ?? "";
      if (!/xml|gpx/i.test(contentType)) throw new Error("서버에서 GPX 파일을 받지 못했어요.");
      const file = await response.blob();
      if (!file.size || file.size > CELL_ROUTE_MAX_BYTES) throw new Error("GPX 파일 크기를 확인하지 못했어요.");
      const url = URL.createObjectURL(file), link = document.createElement("a");
      link.href = url; link.download = communityGpxFilename(route);
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setDownloadError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "GPX 다운로드 시간이 초과됐어요. 다시 시도해 주세요."); }
    finally { clearTimeout(timer); setDownloading(false); }
  }
  const displayed = detail ?? route;
  return <article className="community-route-card">
    <div className="community-route-card-top"><div><span className={`community-route-status community-route-status-${displayed.geometryType}`}>{displayed.geometryType === "none" ? "전체 경로 미확보" : communityGeometryLabel(displayed.geometryType)}</span><h3>{route.name}</h3></div><strong className="community-route-distance">{distance(route.reportedDistanceMeters)}</strong></div>
    <p className="community-route-start"><MapPin size={14} /><span>시작 · {route.startName}</span></p>
    <div className="community-route-card-meta"><span>{route.gpxAvailable ? "GPX 제공" : "GPX 없음"}</span><span>{route.verificationStatus === "reviewed" ? "운영자 확인" : "검증 필요"}</span><span>게임 확인일 {route.lastCheckedAt}</span></div>
    <div className="community-route-actions"><button type="button" className="community-secondary-button" onClick={toggle} aria-expanded={open}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{open ? "접기" : "지도 보기"}</button>{route.gpxAvailable && <button type="button" className="community-download-button" onClick={() => void download()} disabled={downloading}>{downloading ? <LoaderCircle size={15} className="community-spin" /> : <ArrowDownToLine size={15} />}{downloading ? "파일 받는 중" : "GPX 다운로드"}</button>}</div>
    {downloadError && <p className="cell-form-error" role="alert">{downloadError}</p>}
    {open && <div className="community-route-detail">
      {loading && <p className="community-route-loading" role="status"><LoaderCircle size={16} className="community-spin" />상세를 불러오는 중이에요.</p>}
      {error && <div className="cell-form-error" role="alert"><p>{error}</p><button type="button" className="community-inline-button" onClick={() => void loadDetail()}>다시 조회</button></div>}
      {detail && <>
        <RouteGeometryMap name={detail.name} points={detail.points} start={detail.startPoint} end={detail.endPoint} kindLabel={communityGeometryLabel(detail.geometryType)} />
        <dl className="community-route-facts"><div><dt>시작 위치</dt><dd>{detail.startName}<button type="button" className="community-coordinate-button" onClick={() => void coordinateCopy.copy(coordinates(detail.startPoint))}>{coordinateCopy.copied === coordinates(detail.startPoint) ? <Check size={12} /> : null}{coordinateCopy.copied === coordinates(detail.startPoint) ? "복사됨" : coordinates(detail.startPoint)}</button></dd></div><div><dt>종료 위치</dt><dd>{detail.endName || "미확인"}{detail.endPoint && <button type="button" className="community-coordinate-button" onClick={() => void coordinateCopy.copy(coordinates(detail.endPoint!))}>{coordinateCopy.copied === coordinates(detail.endPoint) ? "복사됨" : coordinates(detail.endPoint)}</button>}</dd></div><div><dt>경로 데이터</dt><dd>{detail.geometryType === "none" ? "전체 경로 미확보" : `${communityGeometryLabel(detail.geometryType)} · ${detail.pointCount.toLocaleString()}점`}{typeof detail.computedDistanceMeters === "number" && <small>좌표 계산 거리 {distance(detail.computedDistanceMeters)}</small>}</dd></div><div><dt>제작자</dt><dd>{detail.creatorName}</dd></div><div><dt>이용 근거</dt><dd>{detail.rightsDetails}</dd></div></dl>
        {coordinateCopy.fallback && <label className="community-copy-fallback">자동 복사가 막혔어요. 좌표를 직접 복사해 주세요.<div><input readOnly value={coordinateCopy.fallback} onFocus={(event) => event.currentTarget.select()} aria-label="직접 복사할 루트 좌표" /><button type="button" onClick={coordinateCopy.close} aria-label="좌표 복사 안내 닫기"><X size={14} /></button></div></label>}
        {detail.sourceUrl && <a href={detail.sourceUrl} className="community-source-link" target="_blank" rel="noreferrer">제작자·원문 확인 <ArrowUpRight size={13} /></a>}
        {detail.notes && <p className="community-route-notes">{detail.notes}</p>}
        <p className="community-route-verification-note">{detail.geometryType === "estimated" ? "시작·종료 등 확인된 자료를 바탕으로 만든 추정 경로예요. 실제 게임 경로와 다를 수 있어요." : detail.geometryType === "reconstructed" ? "지도 이미지 등에서 복원한 경로예요. 실제 게임 경로와 다를 수 있어요." : detail.geometryType === "none" ? "시작·종료 위치만 표시해요. 두 위치를 연결해 GPX를 만들지 않습니다." : "제보된 원본 경로 좌표예요. 운영자 확인은 게임 서버의 공식 인증을 뜻하지 않습니다."} 게임에서 현재 루트와 방향을 확인해 주세요.</p>
        {detail.geometryType === "original" && detail.gpxAvailable && detail.points && detail.points.length >= 2 && <button type="button" className="community-secondary-button" onClick={() => { const failure = onImport(detail); setImportError(failure ?? ""); setImportNotice(failure ? "" : "이 기기의 방문 계획에 추가했어요."); }}><Plus size={15} />내 방문 계획에 추가</button>}
        {importError && <p className="cell-form-error" role="alert">{importError}</p>}{importNotice && <p className="cell-form-notice" role="status">{importNotice}</p>}
      </>}
    </div>}
  </article>;
}

type SubmissionForm = { name: string; cityId: string; startName: string; endName: string; startCoordinates: string; endCoordinates: string; distance: string; sourceUrl: string; creatorName: string; rightsBasis: "creator" | "permission" | "license"; rightsDetails: string; lastCheckedAt: string; geometryType: Exclude<CommunityGeometryType, "none">; notes: string; inGameConfirmed: boolean; allowRedistribution: boolean; website: string };
function todayForCity(cityId: string): string {
  const city = CITIES.find((item) => item.id === cityId) ?? CITIES[0];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: city.zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (kind: string) => parts.find((item) => item.type === kind)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function newForm(cityId: string): SubmissionForm { return { name: "", cityId, startName: "", endName: "", startCoordinates: "", endCoordinates: "", distance: "", sourceUrl: "", creatorName: "", rightsBasis: "creator", rightsDetails: "", lastCheckedAt: todayForCity(cityId), geometryType: "original", notes: "", inGameConfirmed: false, allowRedistribution: false, website: "" }; }

function RouteSubmissionForm({ cityId }: { cityId: string }) {
  const [form, setForm] = useState(() => newForm(cityId));
  const [points, setPoints] = useState<CellPoint[] | undefined>(), [filename, setFilename] = useState("");
  const [fileReading, setFileReading] = useState(false), [sending, setSending] = useState(false);
  const [error, setError] = useState(""), [fileError, setFileError] = useState(""), [success, setSuccess] = useState<{ id: string; duplicate: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null), fileRequest = useRef(0), visitor = useRef<string | null>(null);
  useEffect(() => () => { fileRequest.current++; }, []);
  function change<K extends keyof SubmissionForm>(key: K, value: SubmissionForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function readFile(selected: File | undefined) {
    const request = ++fileRequest.current;
    setFileError(""); setPoints(undefined); setFilename(""); setFileReading(false);
    if (!selected) return;
    if (selected.size > CELL_ROUTE_MAX_BYTES) { setFileError("GPX는 1MiB 이하만 제출할 수 있어요."); return; }
    setFileReading(true);
    try {
      const text = await selected.text();
      if (request !== fileRequest.current) return;
      const parsed = parseCellGpx(text, undefined, { preserveConsecutiveDuplicates: true });
      const document = new DOMParser().parseFromString(text, "application/xml");
      const declaredKind = document.getElementsByTagNameNS("*", "geometryType")[0]?.textContent?.trim();
      setPoints(parsed); setFilename(selected.name);
      setForm((current) => ({ ...current, startCoordinates: current.startCoordinates.trim() || coordinates(parsed[0]), endCoordinates: current.endCoordinates.trim() || coordinates(parsed.at(-1)!), geometryType: declaredKind === "estimated" || declaredKind === "reconstructed" || declaredKind === "original" ? declaredKind : current.geometryType }));
    } catch (failure) { if (request === fileRequest.current) setFileError(failure instanceof Error ? failure.message : "GPX를 읽지 못했어요."); }
    finally { if (request === fileRequest.current) setFileReading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || fileReading) return;
    setError(""); setSuccess(null);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25_000);
    try {
      if (fileError) throw new Error("GPX 오류를 해결하거나 파일을 제거해 주세요.");
      if (!form.inGameConfirmed || !form.allowRedistribution) throw new Error("게임 루트 확인과 공개 허락에 동의해 주세요.");
      const startPoint = parsePoint(form.startCoordinates, "시작 좌표"), endPoint = form.endCoordinates.trim() ? parsePoint(form.endCoordinates, "종료 좌표") : undefined;
      const reportedDistanceMeters = Number(form.distance);
      if (!Number.isFinite(reportedDistanceMeters) || reportedDistanceMeters <= 0) throw new Error("게임에 표시된 거리를 m 단위로 입력해 주세요.");
      if (!visitor.current) {
        try { const saved = localStorage.getItem(SUBMITTER_STORAGE_KEY); visitor.current = saved && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved) ? saved : crypto.randomUUID(); localStorage.setItem(SUBMITTER_STORAGE_KEY, visitor.current); }
        catch { visitor.current = crypto.randomUUID(); }
      }
      setSending(true);
      const payload = { visitorId: visitor.current, name: form.name.trim(), cityId: form.cityId, startName: form.startName.trim(), endName: form.endName.trim(), startPoint, endPoint, reportedDistanceMeters, creatorName: form.creatorName.trim(), sourceUrl: form.sourceUrl.trim() || undefined, rightsBasis: form.rightsBasis, rightsDetails: form.rightsDetails.trim(), allowRedistribution: true, inGameConfirmed: true, lastCheckedAt: form.lastCheckedAt, geometryType: points ? form.geometryType : "none", points, notes: form.notes.trim(), website: form.website };
      const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) throw new Error(await responseMessage(response, "제보를 저장하지 못했어요. 입력 내용을 확인해 주세요."));
      const body = await response.json();
      if (!record(body) || body.ok !== true || typeof body.id !== "string" || body.status !== "pending") throw new Error("제보 접수 결과를 확인하지 못했어요. 다시 제출하기 전에 잠시 기다려 주세요.");
      setSuccess({ id: body.id, duplicate: body.duplicate === true });
      setForm(newForm(form.cityId)); setPoints(undefined); setFilename(""); if (file.current) file.current.value = "";
    } catch (failure) { setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "제보 요청 시간이 초과됐어요. 접수됐을 수 있으니 잠시 후 같은 내용으로 다시 확인해 주세요."); }
    finally { clearTimeout(timer); setSending(false); }
  }
  const pending = sending || fileReading;
  return <form className="community-submission-form" onSubmit={(event) => void submit(event)}>
    <p className="community-submission-intro">게임에서 직접 확인한 Pokémon GO 루트를 제보해 주세요. GPX가 없어도 시작 위치와 루트 정보를 받을 수 있어요. 제보는 검토 후 공개됩니다.</p>
    {success && <div className="community-submission-success" role="status"><Check size={18} /><div><strong>{success.duplicate ? "이미 접수된 제보예요" : "제보를 접수했어요"}</strong><p>검토 대기 중입니다. 아직 공개 목록에는 표시되지 않아요.</p><small>접수 번호 {success.id}</small></div></div>}
    <fieldset disabled={sending}>
      <legend className="community-form-legend">루트 정보</legend>
      <div className="cell-form-row"><label>게임에 표시된 루트 이름<input required maxLength={80} value={form.name} onChange={(event) => change("name", event.target.value)} /></label><label>도시<select required value={form.cityId} onChange={(event) => setForm((current) => ({ ...current, cityId: event.target.value, lastCheckedAt: current.lastCheckedAt > todayForCity(event.target.value) ? todayForCity(event.target.value) : current.lastCheckedAt }))}>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.country}</option>)}</select></label></div>
      <div className="cell-form-row"><label>시작 포켓스톱·위치 이름<input required maxLength={120} value={form.startName} onChange={(event) => change("startName", event.target.value)} /></label><label>종료 포켓스톱·위치 이름 <span className="community-optional">선택</span><input maxLength={120} value={form.endName} onChange={(event) => change("endName", event.target.value)} /></label></div>
      <div className="cell-form-row"><label>시작 좌표<input required inputMode="text" maxLength={80} value={form.startCoordinates} onChange={(event) => change("startCoordinates", event.target.value)} placeholder="37.5665,126.978" /><small>위도,경도 · GPX를 넣으면 비어 있는 좌표를 채워요</small></label><label>종료 좌표 <span className="community-optional">선택</span><input inputMode="text" maxLength={80} value={form.endCoordinates} onChange={(event) => change("endCoordinates", event.target.value)} placeholder="위도,경도" /></label></div>
      <div className="cell-form-row"><label>게임 표시 거리 (m)<input type="number" required min={100} max={100000} step={1} inputMode="numeric" value={form.distance} onChange={(event) => change("distance", event.target.value)} placeholder="예: 1200" /></label><label>마지막 게임 확인일<input type="date" required value={form.lastCheckedAt} max={todayForCity(form.cityId)} onChange={(event) => change("lastCheckedAt", event.target.value)} /></label></div>
      <label className="community-file-label"><FileUp size={19} /><span>전체 경로 GPX <small>선택 · 1MiB · 좌표 2,000개 이하</small></span><input ref={file} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" disabled={sending} onChange={(event) => void readFile(event.target.files?.[0])} /></label>
      {fileReading && <p className="community-route-loading" role="status"><LoaderCircle size={15} className="community-spin" />파일을 읽고 있어요.</p>}
      {(filename || fileError) && <div className="community-file-preview"><span>{filename ? `${filename} · ${points?.length.toLocaleString()}점 · ${distance(cellPathKm(points ?? []) * 1000)}` : "선택한 파일을 확인해 주세요"}</span><button type="button" onClick={() => { fileRequest.current++; setFileReading(false); setPoints(undefined); setFilename(""); setFileError(""); if (file.current) file.current.value = ""; }}>파일 제거</button></div>}
      {fileError && <p className="cell-form-error" role="alert">{fileError}</p>}
      {points && <label className="community-full-label">경로를 얻은 방법<select value={form.geometryType} onChange={(event) => change("geometryType", event.target.value as SubmissionForm["geometryType"])}><option value="original">실제 게임 경로 기록의 원본 좌표</option><option value="reconstructed">지도·스크린샷에서 복원한 좌표</option><option value="estimated">시작·종료 등으로 만든 추정 경로</option></select><small>파밍용 GPX를 실제 게임 루트로 제출하지 마세요. 복원·추정 여부는 공개 화면에도 표시해요.</small></label>}
      <label className="community-full-label">제작자·원문 주소 {form.rightsBasis === "creator" && <span className="community-optional">선택</span>}<input type="url" required={form.rightsBasis !== "creator"} maxLength={2048} value={form.sourceUrl} onChange={(event) => change("sourceUrl", event.target.value)} placeholder="https://" /><small>제작자 허락·공개 라이선스로 제출할 때는 근거가 있는 공개 HTTPS 주소가 필요해요.</small></label>
      <label className="community-full-label">참고 사항 <span className="community-optional">선택</span><textarea maxLength={1000} rows={3} value={form.notes} onChange={(event) => change("notes", event.target.value)} placeholder="진행 방향, 출입 시간, 경로 확인 방법 등" /></label>
    </fieldset>
    <fieldset disabled={sending}>
      <legend className="community-form-legend">공개 및 이용 허락</legend>
      <div className="cell-form-row"><label>공개할 제작자·제보자 닉네임<input required maxLength={80} value={form.creatorName} onChange={(event) => change("creatorName", event.target.value)} autoComplete="nickname" /></label><label>이용 허락 근거<select value={form.rightsBasis} onChange={(event) => change("rightsBasis", event.target.value as SubmissionForm["rightsBasis"])}><option value="creator">제가 직접 제작했어요</option><option value="permission">제작자에게 공유 허락을 받았어요</option><option value="license">공개 재배포 라이선스가 있어요</option></select></label></div>
      <label className="community-full-label">확인할 수 있는 이용 허락 설명 {form.rightsBasis === "creator" && <span className="community-optional">선택</span>}<textarea required={form.rightsBasis !== "creator"} minLength={form.rightsBasis === "creator" ? 0 : 20} maxLength={1000} rows={3} value={form.rightsDetails} onChange={(event) => change("rightsDetails", event.target.value)} placeholder="직접 제작 여부, 허락받은 공개 범위 또는 라이선스 이름·근거 주소" /><small>{form.rightsBasis !== "creator" ? "제작자 허락·라이선스 근거를 20자 이상 적어 주세요. " : ""}승인 시 닉네임·위치·설명·출처·이용 근거가 공개됩니다. 연락처·비밀번호 등 개인정보는 넣지 마세요.</small></label>
      <label className="cell-checkbox"><input required type="checkbox" checked={form.inGameConfirmed} onChange={(event) => change("inGameConfirmed", event.target.checked)} /><span>실제 Pokémon GO 게임에 있는 루트임을 직접 확인했어요.</span></label>
      <label className="cell-checkbox"><input required type="checkbox" checked={form.allowRedistribution} onChange={(event) => change("allowRedistribution", event.target.checked)} /><span>제출 자료를 공개할 권리가 있으며, pokedoko에서 루트 정보와 GPX를 공개·다운로드하도록 허락해요.</span></label>
      <div className="community-honeypot" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => change("website", event.target.value)} /></label></div>
    </fieldset>
    {error && <p className="cell-form-error" role="alert">{error}</p>}
    <button type="submit" className="community-submit-button" disabled={pending}>{sending ? <LoaderCircle size={17} className="community-spin" /> : <Send size={16} />}{sending ? "제보 저장 중" : "루트 제보하기"}</button>
    <p className="community-submission-footer">공개된 파일도 재배포 허락은 별도로 확인해야 해요. GPX 제출이나 운영자 확인만으로 현재 게임 이용 가능 여부와 셀 획득을 보장하지 않습니다.</p>
  </form>;
}

export default function CommunityRouteDirectory({ cityId, onCityChange, onImport }: {
  cityId: string;
  onCityChange: (cityId: string) => void;
  onImport: (route: CommunityRouteDetail) => string | null;
}) {
  const [routes, setRoutes] = useState<CommunityRouteSummary[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0), [formOpen, setFormOpen] = useState(false), [formWasOpened, setFormWasOpened] = useState(false);
  const generation = useRef(0);
  const submissionDetails = useRef<HTMLDetailsElement>(null);
  const city = CITIES.find((item) => item.id === cityId) ?? CITIES[0];
  useEffect(() => { if (formOpen) setFormWasOpened(true); }, [formOpen]);
  function openSubmission() {
    setFormOpen(true);
    requestAnimationFrame(() => submissionDetails.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }
  useEffect(() => {
    const request = ++generation.current, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    setLoading(true); setLoadingMore(false); setError(""); setRoutes([]); setTotal(0); setPage(1); setHasMore(false);
    async function load() {
      try {
        const response = await fetch(`/api/routes?city=${encodeURIComponent(cityId)}&page=1`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(await responseMessage(response, "공개 루트 목록을 불러오지 못했어요."));
        const body = readList(await response.json());
        if (request === generation.current) { setRoutes(body.routes); setTotal(body.total); setPage(body.page); setHasMore(body.hasMore === true); }
      } catch (failure) { if (request === generation.current) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "목록 조회 시간이 초과됐어요. 다시 시도해 주세요."); }
      finally { clearTimeout(timer); if (request === generation.current) setLoading(false); }
    }
    void load();
    return () => { generation.current++; clearTimeout(timer); controller.abort(); };
  }, [cityId, refresh]);
  async function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    const request = generation.current, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    setLoadingMore(true); setError("");
    try {
      const response = await fetch(`/api/routes?city=${encodeURIComponent(cityId)}&page=${page + 1}`, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(await responseMessage(response, "다음 루트 목록을 불러오지 못했어요."));
      const body = readList(await response.json());
      if (request === generation.current) { setRoutes((current) => [...current, ...body.routes.filter((item: CommunityRouteSummary) => !current.some((saved) => saved.id === item.id))]); setTotal(body.total); setPage(body.page); setHasMore(body.hasMore === true); }
    } catch (failure) { if (request === generation.current) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "목록 조회 시간이 초과됐어요. 다시 시도해 주세요."); }
    finally { clearTimeout(timer); if (request === generation.current) setLoadingMore(false); }
  }
  return <section className="cell-route-panel community-route-directory" aria-labelledby="community-directory-heading">
    <div className="community-directory-heading"><div><span className="community-eyebrow">COMMUNITY ROUTES</span><h2 id="community-directory-heading">지역별 게임 루트</h2><p>사용자가 제보하고 운영자가 확인한 루트를 모아요.</p></div><button type="button" className="community-submit-shortcut" onClick={openSubmission}><Plus size={16} />루트 제보</button></div>
    <div className="community-directory-toolbar"><label>도시<select aria-label="공개 루트 도시" value={cityId} onChange={(event) => onCityChange(event.target.value)}>{CITIES.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.country}</option>)}</select></label><div><span>{loading ? "조회 중" : error && !routes.length ? "조회 실패" : `${city.name} · ${total.toLocaleString()}개 공개`}</span><button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} aria-label="공개 루트 목록 새로고침"><RefreshCw size={15} /></button></div></div>
    {loading && <div className="community-directory-loading" role="status"><LoaderCircle size={21} className="community-spin" /><p>공개 루트를 불러오고 있어요.</p></div>}
    {!loading && error && <div className="cell-form-error" role="alert"><p>{error}</p><button type="button" className="community-inline-button" onClick={() => setRefresh((value) => value + 1)}>다시 조회</button></div>}
    {!loading && !error && routes.length === 0 && <div className="community-directory-empty"><Route size={29} /><h3>{city.name}의 공개 루트가 아직 없어요</h3><p>게임에서 확인한 루트를 제보해 주세요.<br />전체 경로와 공유 허락이 확인된 자료만 GPX로 제공해요.</p><button type="button" className="community-secondary-button" onClick={openSubmission}><Plus size={15} />첫 루트 제보하기</button></div>}
    {!loading && routes.length > 0 && <div className="community-route-list">{routes.map((route) => <PublicRouteCard key={route.id} route={route} onImport={onImport} />)}</div>}
    {!loading && hasMore && <button type="button" className="community-load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={15} className="community-spin" /> : <ChevronDown size={15} />}{loadingMore ? "더 불러오는 중" : "루트 더 보기"}</button>}
    <p className="community-directory-note">운영자 확인은 게임 서버의 공식 인증이 아닙니다. 경로 종류와 마지막 게임 확인일을 함께 확인해 주세요.</p>
    <details className="community-submit-details" ref={submissionDetails} open={formOpen} onToggle={(event) => setFormOpen(event.currentTarget.open)}><summary><span><FileUp size={17} />게임 루트 제보하기</span><span>{formOpen ? "접기" : "열기"}</span></summary>{(formOpen || formWasOpened) && <RouteSubmissionForm cityId={cityId} />}</details>
  </section>;
}
