"use client";
import { LanguageScope, useLanguage } from "@/components/pokedoko/LanguageProvider";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, FileUp, LocateFixed, MapPin, RefreshCw, Route, Search } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { HUNTING_CATALOG, type HuntingCatalogRoute } from "@/lib/hunting-catalog";
import { HUNTING_MAX_BYTES, parseHuntingCoordinates, parseHuntingGpx, type HuntingPoint } from "@/lib/hunting-route";
import { DEFAULT_HUNTING_SETTINGS, huntingSettingsUrl, parseHuntingSettings, type HuntingEditorSettings, type HuntingSettings } from "@/lib/hunting-settings";
import { orderHuntingStops, type HuntingStopResult } from "@/lib/hunting-stops";
import { formatKst } from "@/lib/raid-time";
import HuntingRouteEditor from "./HuntingRouteEditor";
import "./hunting-routes.css";

type LoadedRoute = { kind: "catalog" | "nearby" | "import"; name: string; points: HuntingPoint[]; source?: { url: string; title?: string; author?: string } };
const CITY_IDS = CITIES.map((city) => city.id);
const ROUTE_IDS = HUNTING_CATALOG.map((route) => route.id);
const countryFlag = (code: string) => code.toUpperCase().replace(/./g, (character) => String.fromCodePoint(127397 + character.charCodeAt(0)));
const errorText = (failure: unknown, fallback: string) => failure instanceof Error && failure.name !== "AbortError" ? failure.message : fallback;

function EditorWithShare({ route, settings, onChange }: { route: LoadedRoute; settings: HuntingSettings; onChange: (patch: Partial<HuntingEditorSettings>) => void }) {
  const [status, setStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const [url, setUrl] = useState("");
  const request = useRef(0), alive = useRef(true), input = useRef<HTMLInputElement>(null), targetUrl = useRef("");
  useEffect(() => { request.current++; targetUrl.current = ""; setStatus("idle"); setUrl(""); }, [route]);
  useEffect(() => {
    if (targetUrl.current && huntingSettingsUrl(location.href, settings).href !== targetUrl.current) {
      request.current++; targetUrl.current = ""; setStatus("idle"); setUrl("");
    }
  }, [settings]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useEffect(() => { if (status === "fallback") { input.current?.focus(); input.current?.select(); } }, [status]);
  async function copy(effective?: HuntingEditorSettings) {
    const value = huntingSettingsUrl(location.href, { ...settings, ...effective }).href;
    const id = ++request.current; targetUrl.current = value; setUrl(value);
    try { await navigator.clipboard.writeText(value); if (alive.current && id === request.current) setStatus("copied"); }
    catch { if (alive.current && id === request.current) setStatus("fallback"); }
  }
  return <LanguageScope>{<><HuntingRouteEditor points={route.points} name={route.name} settings={settings} onChange={onChange} source={route.source} onShare={route.kind === "import" ? undefined : (effective) => void copy(effective)} /><div className="hunt-settings-link" role="status">{status === "copied" && <span><Check size={14} />설정 링크를 복사했어요.</span>}{status === "fallback" && <label>링크를 직접 복사하세요<input ref={input} readOnly value={url} aria-label="복사할 자동사냥 경로 설정 링크" onFocus={(event) => event.currentTarget.select()} /></label>}</div></>}</LanguageScope>;
}

export default function HuntingRoutesPage() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<HuntingSettings>({ ...DEFAULT_HUNTING_SETTINGS });
  const [hydrated, setHydrated] = useState(false);
  const restoring = useRef(false);
  const [loaded, setLoaded] = useState<LoadedRoute | null>(null);
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState("");
  const [stopFeed, setStopFeed] = useState<HuntingStopResult | null>(null);
  const [catalogQuery, setCatalogQuery] = useState(""), [catalogCountry, setCatalogCountry] = useState("all");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [inputType, setInputType] = useState<"gpx" | "coordinates">("gpx"), [raw, setRaw] = useState(""), [importName, setImportName] = useState("");
  const [importError, setImportError] = useState(""), [readingFile, setReadingFile] = useState(false);
  const request = useRef(0), fileRequest = useRef(0), controller = useRef<AbortController | null>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const city = CITIES.find((item) => item.id === settings.cityId) ?? CITIES[0];

  useEffect(() => {
    const read = () => {
      clearSelection();
      restoring.current = true;
      const parsed = parseHuntingSettings(location.search, ROUTE_IDS, CITY_IDS);
      const selectedCity = CITIES.find((item) => item.id === parsed.cityId);
      if (parsed.spot !== "center" && (!selectedCity || Number(parsed.spot) >= selectedCity.spots.length)) parsed.spot = "center";
      setSettings(parsed); setCatalogAttempt((attempt) => attempt + 1); setHydrated(true);
    };
    read(); window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (restoring.current) { restoring.current = false; return; }
    const next = huntingSettingsUrl(location.href, settings, true);
    if (next.href !== location.href) history.replaceState(history.state, "", next.href);
  }, [hydrated, settings]);
  useEffect(() => () => { request.current++; fileRequest.current++; controller.current?.abort(); }, []);

  function clearSelection() {
    request.current++; fileRequest.current++; controller.current?.abort();
    setLoading(false); setReadingFile(false); setLoadError(""); setLoaded(null); setStopFeed(null);
  }
  function changeTab(tab: HuntingSettings["tab"]) {
    clearSelection(); setSettings((current) => ({ ...current, tab }));
  }
  useEffect(() => {
    if (!hydrated) return;
    clearSelection();
    if (settings.tab !== "catalog" || !settings.routeId) return;
    const route = HUNTING_CATALOG.find((item) => item.id === settings.routeId);
    if (!route) return;
    const id = ++request.current, abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 15_000);
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(route.rawUrl, { signal: abort.signal, referrerPolicy: "no-referrer", credentials: "omit" });
        if (!response.ok || Number(response.headers.get("content-length")) > HUNTING_MAX_BYTES) throw new Error("원본 GPX를 불러오지 못했어요. 원문에서 파일을 받은 뒤 ‘내 GPX’로 불러올 수 있어요.");
        const text = await response.text(), points = parseHuntingGpx(text);
        if (id === request.current) setLoaded({ kind: "catalog", name: route.name, points, source: { url: route.sourceUrl, title: route.sourceTitle, author: route.author } });
      } catch (failure) { if (id === request.current) setLoadError(errorText(failure, "원본 응답을 기다리는 시간이 지났어요. 다시 선택하거나 원문에서 파일을 받아주세요.")); }
      finally { clearTimeout(timer); if (id === request.current) setLoading(false); }
    })();
    return () => { clearTimeout(timer); abort.abort(); request.current++; };
    // Route settings do not fetch the same source file again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, settings.tab, settings.routeId, catalogAttempt]);

  function updateNearby(patch: Partial<HuntingSettings>) { clearSelection(); setSettings((current) => ({ ...current, ...patch })); }
  async function createNearby() {
    clearSelection(); const snapshot = settingsRef.current;
    const id = ++request.current, abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 12_000); setLoading(true);
    try {
      const query = new URLSearchParams({ city: snapshot.cityId, spot: snapshot.spot, radius: String(snapshot.radius) });
      const response = await fetch(`/api/gpx/stops?${query}`, { signal: abort.signal, cache: "no-store", referrerPolicy: "no-referrer" });
      const value = await response.json() as HuntingStopResult;
      if (!value || !["ready", "empty", "error"].includes(value.status) || !Array.isArray(value.stops) || value.cityId !== snapshot.cityId) throw new Error("포켓스톱 조회 결과를 읽지 못했어요.");
      if (id !== request.current) return;
      setStopFeed(value);
      if (!response.ok || value.status === "error") throw new Error(value.message || "포켓스톱 자료를 불러오지 못했어요.");
      if (value.stops.length < 2) { setLoadError("이 지역에서 공개된 포켓스톱이 2곳 미만이에요. 다른 장소·반경을 고르거나 공개 GPX를 선택하세요."); return; }
      const ordered = orderHuntingStops(value.stops, value.center, snapshot.maxStops);
      if (ordered.points.length < 2) throw new Error("연결할 수 있는 포켓스톱이 부족해요.");
      setLoaded({ kind: "nearby", name: `${city.name} ${value.center.name} 포켓스톱 순환`, points: ordered.points, source: { url: value.sourceUrl, title: value.sourceName } });
      setSettings((current) => ({ ...current, mode: "loop" }));
    } catch (failure) { if (id === request.current) setLoadError(errorText(failure, "포켓스톱 조회 시간이 지났어요. 잠시 후 다시 시도하세요.")); }
    finally { clearTimeout(timer); if (id === request.current) setLoading(false); }
  }

  function clearImport() { fileRequest.current++; setReadingFile(false); setImportError(""); if (loaded?.kind === "import") setLoaded(null); }
  async function readFile(file?: File) {
    if (!file) return;
    clearImport(); const id = ++fileRequest.current;
    if (file.size > HUNTING_MAX_BYTES) { setImportError("파일은 2MiB 이하만 불러올 수 있어요."); return; }
    setReadingFile(true);
    try {
      const text = await file.text(); if (id !== fileRequest.current) return;
      parseHuntingGpx(text); setRaw(text); setInputType("gpx"); setImportName((value) => value.trim() ? value : file.name.replace(/\.gpx$/i, "").slice(0, 100));
    } catch (failure) { if (id === fileRequest.current) setImportError(errorText(failure, "파일을 읽지 못했어요.")); }
    finally { if (id === fileRequest.current) setReadingFile(false); }
  }
  function useImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearImport();
    try {
      const name = importName.trim(); if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("경로 이름을 100자 이내로 입력하세요.");
      const points = inputType === "gpx" ? parseHuntingGpx(raw) : parseHuntingCoordinates(raw);
      setLoaded({ kind: "import", name, points });
    } catch (failure) { setImportError(errorText(failure, "경로를 읽지 못했어요.")); }
  }
  const countries = [...new Map(HUNTING_CATALOG.map((item) => [item.countryCode, item.countryName])).entries()];
  const catalog = HUNTING_CATALOG.filter((route) => (catalogCountry === "all" || route.countryCode === catalogCountry) && `${route.name} ${route.cityName} ${route.countryName} ${t(route.cityName)} ${t(route.countryName)}`.toLowerCase().includes(catalogQuery.trim().toLowerCase()));
  const renderEditor = () => loaded && <EditorWithShare route={loaded} settings={settings} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} />;
  const chooseRoute = (route: HuntingCatalogRoute) => {
    if (settings.routeId === route.id) setCatalogAttempt((attempt) => attempt + 1);
    else setSettings((current) => ({ ...current, routeId: route.id, mode: "original", laps: 1, reverse: false }));
    requestAnimationFrame(() => document.getElementById(`hunt-catalog-${route.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  return <LanguageScope>{<div className="hunting-page">
    <header className="hunting-header"><a href="/live" className="hunting-brand">poke<strong>doko</strong></a><nav aria-label="주요 메뉴"><a href="/regional">지역 한정 이벤트</a><a href="/live">실시간 레이드</a><a href="/raids">레이드아워</a><a href="/calendar">일정</a><a href="/gpx" aria-current="page">GPX 자동사냥</a><a href="/routes">셀 루트</a></nav></header>
    <main className="hunting-main">
      <section className="hunting-heading"><span className="hunting-eyebrow"><Route size={15} /> GPX ROUTES</span><h1>자동사냥 GPX 경로</h1><p>포켓스톱 순환 경로와 공개 GPX를 골라 이동 속도를 설정하세요.</p><div className="hunting-tags"><span>걷기 9.3km/h</span><span>순회 15km/h</span><span>빠른 순회 20km/h</span></div></section>
      <div className="hunting-tabs" role="group" aria-label="자동사냥 경로 선택 방식">{([{ id: "catalog", label: "공개 GPX", icon: Route }, { id: "nearby", label: "포켓스톱으로 만들기", icon: LocateFixed }, { id: "import", label: "내 GPX", icon: FileUp }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={settings.tab === tab.id} onClick={() => changeTab(tab.id)}><tab.icon size={16} />{tab.label}</button>)}</div>
      {settings.tab === "catalog" && <section className="hunting-library" aria-labelledby="hunting-library-title">
        <div className="hunting-section-heading"><div><h2 id="hunting-library-title">지역별 공개 GPX</h2><p>공개된 포켓몬 GO 경로 모음의 원본을 직접 불러와요.</p></div><span>{HUNTING_CATALOG.length}개 경로</span></div>
        <div className="hunting-library-filters"><label><span>국가</span><select value={catalogCountry} onChange={(event) => { clearSelection(); setSettings((current) => ({ ...current, routeId: "" })); setCatalogCountry(event.target.value); }}><option value="all">전체 국가</option>{countries.map(([code, name]) => <option key={code} value={code}>{countryFlag(code)} {name}</option>)}</select></label><label><span>검색</span><div><Search size={15} /><input aria-label="공개 GPX 지역 검색" maxLength={80} value={catalogQuery} placeholder="도쿄, 시드니, 사라고사" onChange={(event) => { clearSelection(); setSettings((current) => ({ ...current, routeId: "" })); setCatalogQuery(event.target.value); }} /></div></label></div>
        <ul className="hunting-catalog">{catalog.map((route) => {
          const selected = settings.routeId === route.id;
          return <li key={route.id} id={`hunt-catalog-${route.id}`} data-selected={selected}>
            <article><div className="hunting-card-head"><span>{countryFlag(route.countryCode)} {route.cityName}</span><span>{route.closed ? "원본 순환" : "원본 편도"}</span></div><h3><span data-i18n-preserve>{route.name}</span></h3><p>{route.description}</p><div className="hunting-card-metrics"><strong>{route.distanceKm.toFixed(2)}<small>km</small></strong><span>원본 좌표 {route.pointCount.toLocaleString()}개</span></div><div className="hunting-card-actions"><button type="button" onClick={() => chooseRoute(route)} disabled={selected && loading}>{selected && loading ? <RefreshCw size={15} className="spinning" /> : <Route size={15} />}{selected && loading ? "원본 불러오는 중" : selected && loaded ? "선택한 경로" : "이 경로 사용"}<ChevronRight size={15} /></button><a href={route.sourceUrl} target="_blank" rel="noreferrer">원본 <ArrowUpRight size={13} /></a>{route.communityUrl && <a href={route.communityUrl} target="_blank" rel="noreferrer">사용자 글 <ArrowUpRight size={13} /></a>}</div>
            {selected && <div className="hunting-selected" aria-busy={loading}>{loadError && <p className="hunting-error" role="alert">{loadError}</p>}{loading && <p className="hunting-load" role="status">원본 GPX를 확인하고 있어요.</p>}{loaded?.kind === "catalog" && renderEditor()}</div>}</article>
          </li>;
        })}</ul>
        {!catalog.length && <p className="hunting-empty" role="status">검색 조건에 맞는 공개 GPX가 없어요. 다른 국가를 고르거나 검색어를 바꿔보세요.</p>}
        <p className="hunting-note">과거에 공유된 원본 경로는 현재 포켓스톱·출입 경로와 다를 수 있어요.</p>
      </section>}
      {settings.tab === "nearby" && <section className="hunting-nearby hunting-panel" aria-labelledby="hunting-nearby-title">
        <div className="hunting-section-heading"><div><h2 id="hunting-nearby-title">근처 포켓스톱 순환 경로</h2><p>공개 지도에 퀘스트가 등록된 포켓스톱 좌표를 연결해요.</p></div><MapPin size={21} /></div>
        <div className="hunting-nearby-controls"><label>도시<select aria-label="포켓스톱 경로 도시" value={settings.cityId} onChange={(event) => updateNearby({ cityId: event.target.value, spot: "center" })}>{CITIES.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.country}</option>)}</select></label><label>중심 장소<select aria-label="포켓스톱 경로 중심 장소" value={settings.spot} onChange={(event) => updateNearby({ spot: event.target.value })}><option value="center">{city.name} 중심</option>{city.spots.map((spot, index) => <option key={index} value={index}>{spot.name}</option>)}</select></label><label>조회 반경<select aria-label="포켓스톱 경로 반경" value={settings.radius} onChange={(event) => updateNearby({ radius: Number(event.target.value) })}>{[1, 3, 5, 10].map((radius) => <option key={radius} value={radius}>{radius}km</option>)}</select></label><label>최대 포켓스톱<select aria-label="경로 최대 포켓스톱" value={settings.maxStops} onChange={(event) => updateNearby({ maxStops: Number(event.target.value) })}>{[20, 50, 100, 200].map((count) => <option key={count} value={count}>{count}곳</option>)}</select></label></div>
        <button type="button" className="hunting-create-button" onClick={() => void createNearby()} disabled={!hydrated || loading}><RefreshCw size={16} className={loading ? "spinning" : undefined} />{loading ? "포켓스톱 확인 중" : "포켓스톱 경로 만들기"}</button>
        {loadError && <p className="hunting-error" role="alert">{loadError}</p>}
        {stopFeed && <div className="hunting-stop-source"><strong>조회된 포켓스톱 {stopFeed.stops.length}곳</strong><p>전체 포켓스톱 목록이 아닌 공개 퀘스트 자료의 표본이에요.{stopFeed.limited ? " 조회 상한에 도달해 일부 자료만 포함됐어요." : ""}</p><a href={stopFeed.sourceUrl} target="_blank" rel="noreferrer">{stopFeed.sourceName} <ArrowUpRight size={12} /></a>{stopFeed.fetchedAt && <span>원문 확인 {formatKst(new Date(stopFeed.fetchedAt))} KST</span>}</div>}
        {loaded?.kind === "nearby" && renderEditor()}
        <p className="hunting-note">시작은 중심에서 가까운 포켓스톱으로 정해요. 조회된 자료 안에서 이동을 줄이는 순서를 계산하며 실제 보행 도로는 반영하지 않아요. 자료가 없는 지역은 공개 GPX나 내 파일을 이용하세요.</p>
      </section>}
      {settings.tab === "import" && <section className="hunting-import hunting-panel" aria-labelledby="hunting-import-title"><div className="hunting-section-heading"><div><h2 id="hunting-import-title">내 GPX 가져오기</h2><p>파일은 서버에 올리지 않고 현재 탭에서만 사용해요.</p></div><FileUp size={21} /></div>
        <form onSubmit={useImport}><label>경로 이름<input required maxLength={100} value={importName} onChange={(event) => { clearImport(); setImportName(event.target.value); }} placeholder="경로 이름" /></label><div className="hunting-input-tabs"><button type="button" aria-pressed={inputType === "gpx"} onClick={() => { clearImport(); setInputType("gpx"); }}>GPX 파일·내용</button><button type="button" aria-pressed={inputType === "coordinates"} onClick={() => { clearImport(); setInputType("coordinates"); }}>좌표 목록</button></div>{inputType === "gpx" && <label className="hunting-file"><FileUp size={16} />GPX 파일 선택<input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}<label>{inputType === "gpx" ? "GPX 내용" : "위도,경도 · 한 줄에 하나씩"}<textarea required rows={5} maxLength={HUNTING_MAX_BYTES} value={raw} onChange={(event) => { clearImport(); setRaw(event.target.value); }} placeholder={inputType === "gpx" ? "GPX XML을 붙여넣거나 파일을 선택하세요." : "위도,경도 순서로 입력하세요."} spellCheck={false} /></label><p className="hunting-note">2MiB · 원본 좌표 최대 20,000개 · 연결된 경로 1개</p>{importError && <p className="hunting-error" role="alert">{importError}</p>}<button type="submit" className="hunting-create-button" disabled={readingFile || !hydrated}>{readingFile ? "파일 읽는 중" : "이 경로 사용"}<ChevronRight size={15} /></button></form>{loaded?.kind === "import" && renderEditor()}
      </section>}
      <footer className="hunting-footer"><p>이동·포획은 앱에서 실행합니다. GPX는 경로와 선택한 예정 시간만 담아요.</p><a href="/routes">지가르데 셀 루트 계획 <ChevronRight size={13} /></a><a href="/privacy">데이터 보관 안내</a></footer>
    </main>
  </div>}</LanguageScope>;
}
