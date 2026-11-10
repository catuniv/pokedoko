"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeftRight, ArrowRight, Check, ChevronDown, Clipboard, ExternalLink, LoaderCircle, MapPin, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { searchTradeSpecies, tradeSpecies, tradeSpeciesName, tradeSpeciesLocalizedName, type TradeSpecies } from "@/lib/trade-pokemon-search";
import { TradeBackgroundPicker, TradePokemonPreview, tradeBackgroundLabel } from "./TradePokemonDetails";
import { normalizeTradeBackground } from "@/lib/trades";
import type { TradeBackground, TradePokemon, TradePostDetail, TradePostStatus, TradePostSummary } from "@/lib/trades";
import { TRADE_OWNER_LIMIT, TradeOwnerStorageError, completeTradeOwnerJournal, createTradeOwnerJournal, isTradeOwnerStorageEvent, migrateTradeOwnerStorage, readTradeOwnerEntries, removeTradeOwnerEntry, type TradeOwnerEntry } from "@/lib/trade-owner-storage";
import { TradeBackgroundCatalogProvider, useTradeBackgroundCatalog } from "./TradeBackgroundCatalog";
import { LanguageScope, useLanguage } from "./LanguageProvider";
import "./trades.css";

type Species = TradeSpecies;
type OwnedPost = TradeOwnerEntry;
type Filters = { city: string; mode: "all" | "local" | "remote"; variant: "all" | "shiny" | "background" | "costume"; gps: "all" | "yes" | "no" | "unspecified"; speciesId?: number };
type FormValues = { trainerName: string; cityId: string; mode: "local" | "remote"; contactKind: "friend_code" | "discord" | "kakao"; contactValue: string; notes: string; expiresInDays: 1 | 3 | 7; contactPublicConsent: boolean; gps: "unspecified" | "yes" | "no"; website: string };
const VISITOR_STORAGE = "pokedoko.trade-visitor.v1";
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TRADE_HELP = "https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/1143-trading-pokemon/";
const REMOTE_HELP = "https://pokemongo.com/ko/news/pgo-remote-trade-2025";
const STATUS_LABELS: Record<TradePostStatus, string> = { pending: "검토 대기", approved: "모집 중", closed: "모집 마감", removed: "삭제됨", rejected: "공개 보류", expired: "기간 종료" };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function validPokemon(value: unknown, allowAny = false): value is TradePokemon {
  if (!record(value) || typeof value.speciesId !== "number" || !tradeSpecies(value.speciesId) || typeof value.shiny !== "boolean" || typeof value.form !== "string" || value.form.length > 100) return false;
  if (value.background === undefined) return true;
  try { const normalized = normalizeTradeBackground(value.background, allowAny); return record(value.background) && value.background.kind === normalized.kind && value.background.name === normalized.name; } catch { return false; }
}
function validSummary(value: unknown): value is TradePostSummary {
  return record(value) && typeof value.id === "string" && UUID.test(value.id) && typeof value.cityId === "string" && CITIES.some(city => city.id === value.cityId)
    && (value.gpsCapable === undefined || typeof value.gpsCapable === "boolean")
    && (value.mode === "local" || value.mode === "remote") && validPokemon(value.offer) && validPokemon(value.want, true)
    && typeof value.trainerName === "string" && value.trainerName.length <= 80 && typeof value.notes === "string" && value.notes.length <= 1000
    && typeof value.status === "string" && Object.hasOwn(STATUS_LABELS, value.status) && validDate(value.createdAt) && validDate(value.expiresAt);
}
function kakaoUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "open.kakao.com" && !url.port && !url.username && !url.password && /^\/o\/[a-zA-Z0-9]+\/?$/.test(url.pathname); } catch { return false; }
}
function validDetail(value: unknown): value is TradePostDetail {
  if (!record(value)) return false;
  const extra: Record<string, unknown> = value;
  return validSummary(value) && typeof extra.contactValue === "string" && extra.contactValue.length <= 500
    && (extra.contactKind === "friend_code" && /^\d{12}$/.test(extra.contactValue) || extra.contactKind === "discord" && /^[a-zA-Z0-9_.]{2,32}$/.test(extra.contactValue) || extra.contactKind === "kakao" && kakaoUrl(extra.contactValue));
}
function readList(value: unknown) {
  if (!record(value) || value.ok !== true || !Array.isArray(value.posts) || value.posts.length > 100 || !value.posts.every(validSummary) || typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0 || typeof value.page !== "number" || !Number.isSafeInteger(value.page) || value.page < 1 || typeof value.hasMore !== "boolean") throw new Error("모집 목록 응답을 확인하지 못했어요.");
  return { posts: value.posts, total: value.total, page: value.page, hasMore: value.hasMore };
}
async function responseMessage(response: Response, fallback: string) {
  try { const value = await response.json(); if (record(value) && typeof value.message === "string" && value.message.length <= 500) return value.message; } catch { /* Fall back when the server returns a non-JSON error. */ }
  if (response.status === 429) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  if (response.status === 503) return "교환 게시판에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return fallback;
}
async function requestJson(path: string, payload?: unknown): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { Accept: "application/json", ...(payload === undefined ? {} : { "Content-Type": "application/json" }) }, ...(payload === undefined ? {} : { method: "POST", body: JSON.stringify(payload) }) });
    if (!response.ok) throw new Error(await responseMessage(response, response.status === 404 ? "글을 찾지 못했어요. 삭제·마감되었거나 관리 정보가 다를 수 있어요." : "요청을 처리하지 못했어요."));
    try { return await response.json(); } catch (failure) { if (failure instanceof Error && failure.name === "AbortError") throw failure; throw new Error("서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요."); }
  } catch (failure) { if (failure instanceof Error && failure.name === "AbortError") throw new Error("요청 시간이 초과됐어요. 다시 시도해 주세요."); throw failure; }
  finally { clearTimeout(timer); }
}
const speciesName = tradeSpeciesName;
function withoutContact(post: TradePostSummary): TradePostSummary { return { ...(post.gpsCapable === undefined ? {} : { gpsCapable: post.gpsCapable }), id: post.id, cityId: post.cityId, mode: post.mode, offer: post.offer, want: post.want, trainerName: post.trainerName, notes: post.notes, status: post.status, createdAt: post.createdAt, expiresAt: post.expiresAt }; }
function cityName(cityId: string) { return CITIES.find(city => city.id === cityId)?.name ?? cityId; }
function shownStatus(post: TradePostSummary, now: number): TradePostStatus { return (post.status === "pending" || post.status === "approved") && Date.parse(post.expiresAt) <= now ? "expired" : post.status; }
function expiryLabel(date: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date)); }
function newOwnerKey() { return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function ownerStorage(): Storage {
  try { return window.localStorage; } catch { throw new TradeOwnerStorageError("unavailable"); }
}

function SpeciesPicker({ label, value, onChange, optional = false, disabled = false }: { label: string; value?: number; onChange: (value?: number) => void; optional?: boolean; disabled?: boolean }) {
  const { language } = useLanguage();
  const id = useId(), listId = `${id}-results`;
  const [query, setQuery] = useState(value ? speciesName(value) : ""), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (value !== undefined) setQuery(speciesName(value)); }, [value]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const results = useMemo(() => searchTradeSpecies(query), [query]);
  function choose(species: Species) { onChange(species.id); setQuery(species.en); setOpen(false); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
    if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
  }
  return <LanguageScope><div className="trade-species-picker"><label htmlFor={id}>{label}{optional && <small>선택</small>}</label><div className="trade-search-input"><Search size={16} /><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined} value={query} disabled={disabled} autoComplete="off" placeholder="한글·영문·도감 번호 검색" onFocus={() => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); }} onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 120); }} onChange={event => { setQuery(event.target.value); if (value !== undefined) onChange(undefined); setOpen(true); setActive(0); }} onKeyDown={keyDown} />{query && <button type="button" aria-label={`${label} 지우기`} disabled={disabled} onClick={() => { onChange(undefined); setQuery(""); setOpen(false); }}><X size={15} /></button>}</div>{open && !disabled && <div className="trade-species-results" id={listId} role="listbox" aria-label={`${label} 검색 결과`}>{results.map((species, index) => <button id={`${listId}-${species.id}`} role="option" aria-selected={value === species.id} key={species.id} className={active === index ? "is-active" : undefined} type="button" onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(species)}><span>{species.en}<small data-i18n-preserve>{tradeSpeciesLocalizedName(species.id, language)}</small></span><b>#{species.id}</b></button>)}{!results.length && <p>검색 결과가 없어요.</p>}</div>}{value !== undefined && <span className="trade-species-selected"><Check size={12} />{speciesName(value)} · #{value}</span>}</div></LanguageScope>;
}
function ContactInfo({ post }: { post: TradePostDetail }) {
  const [copied, setCopied] = useState(false), [fallback, setFallback] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const label = post.contactKind === "friend_code" ? "친구 코드" : post.contactKind === "discord" ? "Discord 닉네임" : "카카오 오픈채팅";
  const display = post.contactKind === "friend_code" ? post.contactValue.replace(/(\d{4})(?=\d)/g, "$1 ") : post.contactValue;
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(post.contactValue); setCopied(true); setFallback(false);
      if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2200);
    } catch { setCopied(false); setFallback(true); }
  }
  return <LanguageScope><div className="trade-contact"><p className="trade-address-note">상세 주소는 개인 연락처를 교환한 뒤 따로 정해 주세요.</p><span>{label}</span><div>{post.contactKind === "kakao" ? <a href={post.contactValue} target="_blank" rel="noreferrer">오픈채팅 열기 <ExternalLink size={14} /></a> : <strong data-i18n-preserve>{display}</strong>}<button type="button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "복사됨" : "복사"}</button></div>{fallback && <label className="trade-copy-fallback">자동 복사가 막혔어요. 아래 내용을 선택해 복사해 주세요.<input readOnly value={post.contactValue} onFocus={event => event.currentTarget.select()} aria-label="직접 복사할 연락 방법" /></label>}</div></LanguageScope>;
}
function TradeCard({ post }: { post: TradePostSummary }) {
  const [open, setOpen] = useState(false), [detail, setDetail] = useState<TradePostDetail | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  async function reveal() {
    if (open) { generation.current++; setOpen(false); setDetail(null); setLoading(false); return; }
    setOpen(true); setLoading(true); setError(""); const request = ++generation.current;
    try {
      const value = await requestJson(`/api/trades/${encodeURIComponent(post.id)}`);
      if (!record(value) || value.ok !== true || !validDetail(value.post) || value.post.id !== post.id) throw new Error("글 상세 응답을 확인하지 못했어요.");
      if (request === generation.current) setDetail(value.post);
    } catch (failure) { if (request === generation.current) setError(failure instanceof Error ? failure.message : "연락 방법을 불러오지 못했어요."); }
    finally { if (request === generation.current) setLoading(false); }
  }
  return <LanguageScope><article className="trade-card"><div className="trade-card-top"><span className={`trade-mode trade-mode-${post.mode}`}>{post.mode === "remote" ? "리모트 교환 준비" : "대면 교환"}</span><span><MapPin size={12} />{cityName(post.cityId)}</span></div><span className="trade-gps-badge">GPS 위치 변경 · {post.gpsCapable === undefined ? "미지정" : post.gpsCapable ? "가능" : "불가능"}</span><div className="trade-pair"><section><h3>줄 포켓몬</h3><TradePokemonPreview pokemon={post.offer} /></section><ArrowRight size={20} aria-label="교환 희망" /><section><h3>원하는 포켓몬</h3><TradePokemonPreview pokemon={post.want} /></section></div><p className="trade-card-author"><span data-i18n-preserve>{post.trainerName}</span><span>한국시간 {expiryLabel(post.expiresAt)}까지</span></p>{post.notes && <p className="trade-card-notes" data-i18n-preserve>{post.notes}</p>}<button className="trade-contact-toggle" type="button" onClick={() => void reveal()} aria-expanded={open}>{loading ? <LoaderCircle size={15} className="trade-spin" /> : open ? <X size={15} /> : <Send size={15} />}{open ? "연락 방법 닫기" : "연락 방법 보기"}</button>{open && <div className="trade-detail">{loading && <p className="trade-muted" role="status">연락 방법을 불러오고 있어요.</p>}{error && <p className="trade-error" role="alert">{error}</p>}{detail && <ContactInfo post={detail} />}{post.mode === "remote" && <p className="trade-detail-note">리모트 교환은 상대와 포에버 프렌드 조건을 충족하고 게임에서 교환 기회를 얻어야 해요. <a href={REMOTE_HELP} target="_blank" rel="noreferrer">공식 조건 보기</a></p>}</div>}</article></LanguageScope>;
}

function TradeForm({ defaultCity, canPost, onCreated, onJournalSaved, onWarning, onSendingChange }: { defaultCity: string; canPost: boolean; onCreated: (post: OwnedPost) => void; onJournalSaved: (post: OwnedPost) => void; onWarning: (message: string) => void; onSendingChange: (entryId: string | null) => void }) {
  const [form, setForm] = useState<FormValues>({ trainerName: "", cityId: defaultCity === "all" ? "seoul" : defaultCity, mode: "local", contactKind: "friend_code", contactValue: "", notes: "", expiresInDays: 3, contactPublicConsent: false, gps: "unspecified", website: "" });
  const [offerId, setOfferId] = useState<number>(), [wantId, setWantId] = useState<number>();
  const [offerShiny, setOfferShiny] = useState(false), [wantShiny, setWantShiny] = useState(false), [offerForm, setOfferForm] = useState(""), [wantForm, setWantForm] = useState("");
  const [offerBackground, setOfferBackground] = useState<TradeBackground>(), [wantBackground, setWantBackground] = useState<TradeBackground>();
  const [sending, setSending] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState<{ id: string; duplicate: boolean } | null>(null);
  const journal = useRef<{ entryId: string; ownerKey: string; createdAt: string } | null>(null), visitor = useRef<string | null>(null);
  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) { setForm(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending || success) return; setError("");
    try {
      if (!canPost && !journal.current) throw new TradeOwnerStorageError("limit");
      if (offerId === undefined || wantId === undefined) throw new Error("줄 포켓몬과 원하는 포켓몬을 검색 결과에서 각각 선택해 주세요.");
      if (offerBackground) normalizeTradeBackground(offerBackground);
      if (wantBackground) normalizeTradeBackground(wantBackground, true);
      if (!form.contactPublicConsent) throw new Error("연락 방법 공개에 동의해 주세요.");
      const contactValue = form.contactKind === "friend_code" ? form.contactValue.replace(/[\s-]/g, "") : form.contactValue.trim();
      if (form.contactKind === "friend_code" && !/^\d{12}$/.test(contactValue)) throw new Error("친구 코드는 숫자 12자리를 입력해 주세요.");
      if (form.contactKind === "discord" && !/^[a-zA-Z0-9_.]{2,32}$/.test(contactValue)) throw new Error("Discord 사용자명은 영문·숫자·밑줄·마침표 2~32자로 입력해 주세요.");
      if (form.contactKind === "kakao" && !kakaoUrl(contactValue)) throw new Error("카카오 오픈채팅의 https://open.kakao.com/o/ 주소를 입력해 주세요.");
      if (!visitor.current) {
        try { const storage = ownerStorage(), saved = storage.getItem(VISITOR_STORAGE); visitor.current = saved && UUID.test(saved) ? saved : crypto.randomUUID(); storage.setItem(VISITOR_STORAGE, visitor.current); }
        catch { throw new TradeOwnerStorageError("unavailable"); }
      }
      journal.current ??= { entryId: crypto.randomUUID(), ownerKey: newOwnerKey(), createdAt: new Date().toISOString() };
      // Persist and verify the management capability before any submission can reach the server.
      const durable = createTradeOwnerJournal(ownerStorage(), journal.current);
      onJournalSaved(durable); onSendingChange(durable.entryId);
      const offer: TradePokemon = { speciesId: offerId, shiny: offerShiny, form: offerForm.trim(), ...(offerBackground ? { background: { ...offerBackground, name: offerBackground.name.trim() } } : {}) }, want: TradePokemon = { speciesId: wantId, shiny: wantShiny, form: wantForm.trim(), ...(wantBackground ? { background: { ...wantBackground, name: wantBackground.name.trim() } } : {}) };
      const gpsChoice = form.gps === "unspecified" ? {} : { gpsCapable: form.gps === "yes" };
      const payload = { ...gpsChoice, visitorId: visitor.current, ownerKey: durable.ownerKey, trainerName: form.trainerName.trim(), cityId: form.cityId, mode: form.mode, offer, want, contactKind: form.contactKind, contactValue, contactPublicConsent: true, notes: form.notes.trim(), expiresInDays: form.expiresInDays, website: form.website };
      setSending(true);
      const value = await requestJson("/api/trades", payload);
      if (!record(value) || value.ok !== true || typeof value.id !== "string" || !UUID.test(value.id) || typeof value.status !== "string" || !Object.hasOwn(STATUS_LABELS, value.status) || !validDate(value.expiresAt)) throw new Error("접수 결과를 확인하지 못했어요. 다시 시도하면 같은 관리 정보로 확인해요.");
      let post: TradePostSummary = { ...gpsChoice, id: value.id, cityId: form.cityId, mode: form.mode, offer, want, trainerName: form.trainerName.trim(), notes: form.notes.trim(), status: value.status as TradePostStatus, createdAt: new Date().toISOString(), expiresAt: value.expiresAt };
      try { const current = await requestJson(`/api/trades/${encodeURIComponent(post.id)}/manage`, { ownerKey: durable.ownerKey, action: "status" }); if (record(current) && current.ok === true && validDetail(current.post) && current.post.id === post.id) post = withoutContact(current.post); } catch { /* The saved draft can recover the receipt after a response is lost. */ }
      let completed: OwnedPost = { ...durable, post };
      try { completed = completeTradeOwnerJournal(ownerStorage(), durable.entryId, durable.ownerKey, post); }
      catch (failure) { onWarning(failure instanceof TradeOwnerStorageError && failure.code === "removed" ? "다른 탭에서 이 작성 기록을 정리했어요. 접수 결과는 확인했지만 관리 기록을 다시 만들지는 않았어요." : "글은 접수됐지만 접수 상태를 기기에 저장하지 못했어요. 이 기기의 작성 기록을 지우지 말고 접수 상태를 다시 확인해 주세요."); }
      onCreated(completed); setSuccess({ id: post.id, duplicate: value.duplicate === true }); journal.current = null;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "모집 글을 접수하지 못했어요."); }
    finally { setSending(false); onSendingChange(null); }
  }
  return <LanguageScope><form className="trade-form" onSubmit={event => void submit(event)}><p className="trade-form-intro">사용자가 올린 모집 글은 검토 후 공개해요. 실제 포켓몬 교환은 Pokémon GO에서 진행하며 계정이나 보유 포켓몬을 연결하지 않아요.</p>{success && <div className="trade-success" role="status"><Check size={19} /><div><strong>{success.duplicate ? "이미 접수된 글의 상태를 확인했어요." : "모집 글을 접수했어요."}</strong><p>{success.duplicate ? "이전 요청이 접수되어 새 글을 만들지 않았어요. ‘내가 올린 글’에서 실제 내용을 확인해 주세요." : "검토가 끝나면 공개돼요. ‘내가 올린 글’에서 상태를 확인하고 마감·삭제할 수 있어요."}</p><small>접수번호 {success.id}</small></div></div>}<fieldset disabled={sending || !!success}>
    <legend>교환할 포켓몬</legend><div className="trade-form-pair"><section><TradePokemonPreview background={offerBackground} pokemon={offerId === undefined ? undefined : { speciesId: offerId, shiny: offerShiny, form: offerForm, background: offerBackground }} emptyLabel="줄 포켓몬" /><SpeciesPicker label="줄 포켓몬" value={offerId} onChange={setOfferId} disabled={sending || !!success} /><label className="trade-checkbox"><input type="checkbox" checked={offerShiny} onChange={event => setOfferShiny(event.target.checked)} />색이 다른 포켓몬</label><label>모습·의상 <small>선택</small><input maxLength={50} value={offerForm} onChange={event => setOfferForm(event.target.value)} placeholder="예: Alolan, Party Hat" /></label><TradeBackgroundPicker label="줄 포켓몬 배경" value={offerBackground} onChange={setOfferBackground} /></section><section><TradePokemonPreview background={wantBackground} pokemon={wantId === undefined ? undefined : { speciesId: wantId, shiny: wantShiny, form: wantForm, background: wantBackground }} emptyLabel="원하는 포켓몬" /><SpeciesPicker label="원하는 포켓몬" value={wantId} onChange={setWantId} disabled={sending || !!success} /><label className="trade-checkbox"><input type="checkbox" checked={wantShiny} onChange={event => setWantShiny(event.target.checked)} />색이 다른 포켓몬</label><label>모습·의상 <small>선택</small><input maxLength={50} value={wantForm} onChange={event => setWantForm(event.target.value)} placeholder="예: Galarian, Flower Crown" /></label><TradeBackgroundPicker label="원하는 포켓몬 배경" value={wantBackground} onChange={setWantBackground} wanted /></section></div>
    <h3 className="trade-form-section-title">모집 조건</h3><div className="trade-form-row"><label>도시<select value={form.cityId} onChange={event => change("cityId", event.target.value)}>{CITIES.map(city => <option key={city.id} value={city.id}>{city.name} · {city.country}</option>)}</select></label><label>교환 방법<select value={form.mode} onChange={event => change("mode", event.target.value as FormValues["mode"])}><option value="local">대면 교환</option><option value="remote">리모트 교환 준비</option></select></label></div>{form.mode === "remote" && <p className="trade-info-note">리모트 교환은 포에버 프렌드 조건과 게임 내 교환 기회가 필요해요. 새로 만난 상대와 바로 교환할 수 있다는 뜻은 아니에요. <a href={REMOTE_HELP} target="_blank" rel="noreferrer">공식 조건</a></p>}<div className="trade-form-row"><label>공개 닉네임<input required maxLength={40} value={form.trainerName} onChange={event => change("trainerName", event.target.value)} placeholder="상대에게 표시할 이름" /></label><label>모집 기간<select value={form.expiresInDays} onChange={event => change("expiresInDays", Number(event.target.value) as FormValues["expiresInDays"])}><option value={1}>1일</option><option value={3}>3일</option><option value={7}>7일</option></select><small className="trade-field-note">접수 시점부터 계산해요.</small></label></div>
    <label className="trade-wide-label">GPS 위치 변경<select value={form.gps} onChange={event => change("gps", event.target.value as FormValues["gps"])}><option value="unspecified">미지정</option><option value="yes">가능</option><option value="no">불가능</option></select><small className="trade-field-note">위치 조작 가능 여부를 직접 선택해 주세요.</small></label><h3 className="trade-form-section-title">연락 방법</h3><p className="trade-address-note">상세 주소는 개인 연락처를 교환한 뒤 따로 정해 주세요.</p><div className="trade-form-row"><label>연락 수단<select value={form.contactKind} onChange={event => setForm(current => ({ ...current, contactKind: event.target.value as FormValues["contactKind"], contactValue: "" }))}><option value="friend_code">친구 코드</option><option value="discord">Discord 사용자명</option><option value="kakao">카카오 오픈채팅</option></select></label><label>{form.contactKind === "friend_code" ? "친구 코드 12자리" : form.contactKind === "discord" ? "Discord 사용자명" : "오픈채팅 주소"}<input required maxLength={form.contactKind === "kakao" ? 300 : 40} type={form.contactKind === "kakao" ? "url" : "text"} inputMode={form.contactKind === "friend_code" ? "numeric" : undefined} value={form.contactValue} onChange={event => change("contactValue", event.target.value)} placeholder={form.contactKind === "friend_code" ? "1234 5678 9012" : form.contactKind === "discord" ? "영문·숫자·밑줄·마침표" : "https://open.kakao.com/o/..."} /></label></div><label className="trade-wide-label">참고 사항 <small>선택 · 500자</small><textarea maxLength={500} rows={3} value={form.notes} onChange={event => change("notes", event.target.value)} placeholder="도감 등록 여부, 가능한 시간, 희망 조건 등. 전화번호·집 주소·계정 비밀번호는 적지 마세요." /></label><label className="trade-checkbox trade-consent"><input type="checkbox" required checked={form.contactPublicConsent} onChange={event => change("contactPublicConsent", event.target.checked)} /><span>승인 후 닉네임·교환 조건·연락 방법이 공개되는 것에 동의해요.</span></label><div className="trade-honeypot" aria-hidden="true"><label>Website<input autoComplete="off" tabIndex={-1} value={form.website} onChange={event => change("website", event.target.value)} /></label></div>
    </fieldset>{error && <p className="trade-error" role="alert">{error}</p>}<button className="trade-primary-button trade-submit" type="submit" disabled={sending || (!canPost && !journal.current) || !!success}>{sending ? <LoaderCircle size={17} className="trade-spin" /> : <Send size={17} />}{sending ? "접수 중" : success ? "접수 완료" : "교환 모집 글 올리기"}</button>{success && <button className="trade-secondary-button trade-new-post" type="button" onClick={() => { setSuccess(null); change("contactPublicConsent", false); }}>다른 모집 글 작성</button>}<p className="trade-small-note">글 관리 정보는 이 브라우저에만 보관해요. 브라우저 데이터를 지우거나 다른 기기로 접속하면 내 글 관리 기능을 쓰지 못할 수 있어요. <a href={TRADE_HELP} target="_blank" rel="noreferrer">게임 교환 안내</a></p></form></LanguageScope>;
}

function TradeBoardContent() {
  const catalog = useTradeBackgroundCatalog();
  const [filters, setFilters] = useState<Filters>({ city: "all", mode: "all", variant: "all", gps: "all" }), [filtersReady, setFiltersReady] = useState(false);
  const [posts, setPosts] = useState<TradePostSummary[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [owned, setOwned] = useState<OwnedPost[]>([]), [ownedCount, setOwnedCount] = useState(0), [ownedReady, setOwnedReady] = useState(false), [storageWritable, setStorageWritable] = useState(true), [storageWarning, setStorageWarning] = useState("");
  const [refreshingOwned, setRefreshingOwned] = useState(false), [managing, setManaging] = useState<string | null>(null), [ownedError, setOwnedError] = useState("");
  const [confirmation, setConfirmation] = useState<{ id: string; action: "close" | "delete" | "forget" } | null>(null), [formOpen, setFormOpen] = useState(false), [formWasOpened, setFormWasOpened] = useState(false);
  const [now, setNow] = useState<number | null>(null), [activeJournalId, setActiveJournalId] = useState<string | null>(null);
  const requestGeneration = useRef(0), ownedRef = useRef<OwnedPost[]>([]), ownerRefreshGeneration = useRef(0), ownerTask = useRef<string | null>(null), activeJournal = useRef<string | null>(null);
  const submission = useRef<HTMLDetailsElement>(null), ownSection = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const query = new URLSearchParams(location.search), city = query.get("city"), mode = query.get("mode"), species = query.get("speciesId"), variant = query.get("variant"), gps = query.get("gps");
    setFilters({ city: city && CITIES.some(item => item.id === city) ? city : "all", mode: mode === "local" || mode === "remote" ? mode : "all", gps: gps === "yes" || gps === "no" || gps === "unspecified" ? gps : "all", variant: variant === "shiny" || variant === "background" || variant === "costume" ? variant : "all", ...(species && /^\d+$/.test(species) && tradeSpecies(Number(species)) ? { speciesId: Number(species) } : {}) }); setFiltersReady(true);
    const restored = syncOwnerStorage(true); setOwnedReady(true);
    const recoverTimer = setTimeout(() => { if (restored.some(item => !item.post)) void refreshOwned(undefined, true); }, 0);
    const storageChanged = (event: StorageEvent) => { if (isTradeOwnerStorageEvent(event)) syncOwnerStorage(true); };
    window.addEventListener("storage", storageChanged);
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearInterval(timer); clearTimeout(recoverTimer); window.removeEventListener("storage", storageChanged); requestGeneration.current++; ownerRefreshGeneration.current++; ownerTask.current = null; };
  }, []);
  useEffect(() => {
    if (!filtersReady) return;
    const current = ++requestGeneration.current; setLoading(true); setLoadingMore(false); setError(""); setPosts([]); setPage(1); setHasMore(false);
    const params = new URLSearchParams({ city: filters.city, mode: filters.mode, variant: filters.variant, gps: filters.gps, page: "1" }); if (filters.speciesId) params.set("speciesId", String(filters.speciesId));
    const url = new URL(location.href); url.searchParams.set("city", filters.city); url.searchParams.set("mode", filters.mode); if (filters.gps !== "all") url.searchParams.set("gps", filters.gps); else url.searchParams.delete("gps"); if (filters.variant !== "all") url.searchParams.set("variant", filters.variant); else url.searchParams.delete("variant"); if (filters.speciesId) url.searchParams.set("speciesId", String(filters.speciesId)); else url.searchParams.delete("speciesId"); history.replaceState(null, "", url);
    void requestJson(`/api/trades?${params}`).then(value => { const result = readList(value); if (current === requestGeneration.current) { setPosts(result.posts); setTotal(result.total); setPage(result.page); setHasMore(result.hasMore); } }).catch(failure => { if (current === requestGeneration.current) setError(failure instanceof Error ? failure.message : "모집 글을 불러오지 못했어요."); }).finally(() => { if (current === requestGeneration.current) setLoading(false); });
  }, [filters, filtersReady, refresh]);
  function storageWarningFor(message: string) { setStorageWarning(message); setStorageWritable(false); }
  function syncOwnerStorage(migrate = false, preferred?: OwnedPost): OwnedPost[] {
    try {
      const storage = ownerStorage(); let migrationWarning = "";
      if (migrate) try { migrateTradeOwnerStorage(storage); } catch { migrationWarning = "이전 작성 기록 일부를 옮기지 못했어요. 기존 기록은 유지했어요."; }
      const state = readTradeOwnerEntries(storage), previous = new Map(ownedRef.current.map(item => [item.entryId, item]));
      if (preferred) previous.set(preferred.entryId, preferred);
      const entries = state.entries.map(item => {
        const remembered = preferred?.entryId === item.entryId ? preferred : !item.post ? previous.get(item.entryId) : undefined;
        if (!remembered?.post || remembered.ownerKey !== item.ownerKey) return item;
        if (item.post && ["closed", "removed", "rejected", "expired"].includes(item.post.status)) return item;
        return { ...item, post: remembered.post };
      });
      ownedRef.current = entries; setOwned(entries); setOwnedCount(state.count);
      if (state.unreadableCount || migrationWarning) setStorageWarning(migrationWarning || "작성 기록 일부를 읽지 못했어요. 기존 저장 정보는 지우지 않았어요.");
      return entries;
    } catch { storageWarningFor("브라우저의 작성 기록을 읽을 수 없어요. 저장 공간과 브라우저 설정을 확인해 주세요. 관리 정보가 저장되지 않으면 새 글은 접수하지 않아요."); return ownedRef.current; }
  }
  function journalSaved(value: OwnedPost) {
    setStorageWarning(""); setStorageWritable(true); syncOwnerStorage(false, value);
    if (ownSection.current) ownSection.current.open = true;
  }
  function addOwned(value: OwnedPost) {
    syncOwnerStorage(false, value);
    if (ownSection.current) ownSection.current.open = true;
  }
  function submissionSending(entryId: string | null) { activeJournal.current = entryId; setActiveJournalId(entryId); }
  function saveKnownPost(item: OwnedPost, post: TradePostSummary) {
    let updated: OwnedPost = { ...item, post };
    try { updated = completeTradeOwnerJournal(ownerStorage(), item.entryId, item.ownerKey, post); }
    catch (failure) {
      if (failure instanceof TradeOwnerStorageError && failure.code === "removed") { syncOwnerStorage(); return; }
      storageWarningFor("접수 상태를 기기에 저장하지 못했어요. 기존 작성 기록은 유지했으니 나중에 접수 상태를 다시 확인해 주세요.");
    }
    syncOwnerStorage(false, updated);
  }
  function openForm() {
    setFormOpen(true); setFormWasOpened(true);
    requestAnimationFrame(() => { if (submission.current) { submission.current.open = true; submission.current.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } });
  }
  async function loadMore() {
    if (loadingMore || loading || !hasMore) return; setLoadingMore(true); setError(""); const generation = requestGeneration.current;
    const params = new URLSearchParams({ city: filters.city, mode: filters.mode, variant: filters.variant, gps: filters.gps, page: String(page + 1) }); if (filters.speciesId) params.set("speciesId", String(filters.speciesId));
    try { const result = readList(await requestJson(`/api/trades?${params}`)); if (generation === requestGeneration.current) { setPosts(current => [...new Map([...current, ...result.posts].map(post => [post.id, post])).values()]); setPage(result.page); setTotal(result.total); setHasMore(result.hasMore); } }
    catch (failure) { if (generation === requestGeneration.current) setError(failure instanceof Error ? failure.message : "다음 글을 불러오지 못했어요."); }
    finally { if (generation === requestGeneration.current) setLoadingMore(false); }
  }
  async function refreshOwned(entryId?: string, onlyUnconfirmed = false) {
    if (ownerTask.current) return;
    const generation = ++ownerRefreshGeneration.current, task = `refresh:${generation}`;
    ownerTask.current = task; setRefreshingOwned(true); setOwnedError("");
    const snapshot = ownedRef.current.filter(item => item.entryId !== activeJournal.current && (!entryId || item.entryId === entryId) && (!onlyUnconfirmed || !item.post));
    let cursor = 0, failures = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(3, snapshot.length) }, async () => {
        while (cursor < snapshot.length) {
          const item = snapshot[cursor++];
          try {
            const value = item.post ? await requestJson(`/api/trades/${encodeURIComponent(item.post.id)}/manage`, { ownerKey: item.ownerKey, action: "status" }) : await requestJson("/api/trades/recover", { ownerKey: item.ownerKey });
            if (!record(value) || value.ok !== true || !validDetail(value.post) || item.post && value.post.id !== item.post.id) throw new Error();
            if (generation === ownerRefreshGeneration.current) saveKnownPost(item, withoutContact(value.post));
          } catch { failures++; }
        }
      }));
      if (generation === ownerRefreshGeneration.current && failures) setOwnedError(`${failures}개 작성 기록의 접수 상태를 아직 확인하지 못했어요. 기록은 유지했어요. 잠시 후 다시 확인해 주세요.`);
    } finally { if (ownerTask.current === task) ownerTask.current = null; if (generation === ownerRefreshGeneration.current) setRefreshingOwned(false); }
  }
  async function manage(entryId: string, action: "close" | "delete" | "forget") {
    if (ownerTask.current || activeJournal.current === entryId) return;
    const item = ownedRef.current.find(value => value.entryId === entryId); if (!item) return;
    ownerTask.current = entryId; setManaging(entryId); setOwnedError("");
    try {
      if (action === "forget") { removeTradeOwnerEntry(ownerStorage(), entryId); syncOwnerStorage(); setConfirmation(null); return; }
      if (!item.post) throw new Error("먼저 접수 상태를 확인해 주세요. 확인하지 못한 작성 기록은 자동으로 지우지 않아요.");
      const result = await requestJson(`/api/trades/${encodeURIComponent(item.post.id)}/manage`, { ownerKey: item.ownerKey, action });
      if (!record(result) || result.ok !== true) throw new Error("처리 결과를 확인하지 못했어요.");
      if (action === "delete") {
        if (result.deleted !== true) throw new Error("삭제 결과를 확인하지 못했어요.");
        try { removeTradeOwnerEntry(ownerStorage(), entryId); syncOwnerStorage(); }
        catch { storageWarningFor("서버의 글은 삭제했지만 이 기기의 작성 기록을 정리하지 못했어요. 저장 설정을 확인한 뒤 기기 기록을 정리해 주세요."); syncOwnerStorage(false, { ...item, post: { ...item.post, status: "removed" } }); }
      } else {
        if (!validDetail(result.post) || result.post.id !== item.post.id) throw new Error("마감 결과를 확인하지 못했어요.");
        saveKnownPost(item, withoutContact(result.post));
      }
      setConfirmation(null); setRefresh(value => value + 1);
    } catch (failure) { setOwnedError(failure instanceof Error ? failure.message : "글을 관리하지 못했어요."); }
    finally { if (ownerTask.current === entryId) ownerTask.current = null; setManaging(null); }
  }
  const visiblePosts = now === null ? posts : posts.filter(post => Date.parse(post.expiresAt) > now);
  return <LanguageScope><div className="trade-page"><header className="trade-header"><a className="trade-brand" href="/live">poke<strong>doko</strong></a><nav aria-label="주요 메뉴"><a href="/live">실시간 레이드</a><a href="/calendar">이벤트 달력</a><a href="/routes">지가르데 셀 루트</a><a href="/trades" aria-current="page">교환 상대 찾기</a></nav></header><main className="trade-main"><section className="trade-heading"><span><ArrowLeftRight size={16} />POKÉMON GO TRADES</span><h1>포켓몬 교환 상대 찾기</h1><p>줄 포켓몬과 원하는 포켓몬을 등록하고 교환 상대를 찾아보세요.</p></section><div className="trade-intro-note"><ShieldCheck size={20} /><p><strong>사용자 모집 · 검토 후 공개</strong>실제 교환은 Pokémon GO에서 진행해요. 대면 교환은 가까운 장소에서, 리모트 교환은 포에버 프렌드 조건을 확인해 주세요. <a href={REMOTE_HELP} target="_blank" rel="noreferrer">리모트 교환 안내 <ExternalLink size={11} /></a></p></div>
    <section className="trade-panel" aria-labelledby="trade-directory-title"><div className="trade-panel-heading"><div><span className="trade-eyebrow">COMMUNITY TRADES</span><h2 id="trade-directory-title">교환 모집 글</h2><p>도시와 포켓몬으로 모집 중인 글을 찾아요.</p></div><button className="trade-yellow-button" type="button" onClick={openForm}><Plus size={16} />모집 글 올리기</button></div><div className="trade-filters"><label>도시<select value={filters.city} onChange={event => setFilters(current => ({ ...current, city: event.target.value }))}><option value="all">모든 도시</option>{CITIES.map(city => <option key={city.id} value={city.id}>{city.name} · {city.country}</option>)}</select></label><label>교환 방법<select value={filters.mode} onChange={event => setFilters(current => ({ ...current, mode: event.target.value as Filters["mode"] }))}><option value="all">전체</option><option value="local">대면 교환</option><option value="remote">리모트 교환 준비</option></select></label><SpeciesPicker label="포켓몬 찾기" value={filters.speciesId} onChange={speciesId => setFilters(current => ({ ...current, speciesId }))} optional /></div><label className="trade-gps-filter">GPS 가능 여부<select value={filters.gps} onChange={event => setFilters(current => ({ ...current, gps: event.target.value as Filters["gps"] }))}><option value="all">전체</option><option value="yes">가능</option><option value="no">불가능</option><option value="unspecified">미지정</option></select></label><div className="trade-variant-filters" role="group" aria-label="포켓몬 종류 필터">{([["all", "전체"], ["shiny", "색이 다름"], ["background", "배경"], ["costume", "모습·의상"]] as const).map(([variant, label]) => <button key={variant} type="button" aria-pressed={filters.variant === variant} onClick={() => setFilters(current => ({ ...current, variant }))}>{label}</button>)}</div><div className="trade-list-toolbar"><span>{loading ? "조회 중" : `모집 중 ${total.toLocaleString()}개`}{filters.speciesId ? " · 줄 포켓몬과 원하는 포켓몬에서 검색" : ""}</span><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="교환 모집 새로고침"><RefreshCw size={16} /></button></div>{loading && <div className="trade-loading" role="status"><LoaderCircle size={23} className="trade-spin" /><p>모집 글을 불러오고 있어요.</p></div>}{!loading && error && <div className="trade-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>다시 조회</button></div>}{!loading && !error && !visiblePosts.length && <div className="trade-empty"><ArrowLeftRight size={31} /><h3>이 조건의 모집 글이 아직 없어요.</h3><p>줄 포켓몬과 원하는 포켓몬을 등록해 보세요.<br />검토가 끝난 모집 글부터 여기에 표시돼요.</p><button className="trade-secondary-button" type="button" onClick={openForm}><Plus size={15} />첫 모집 글 올리기</button></div>}{!loading && visiblePosts.length > 0 && <div className="trade-card-list">{visiblePosts.map(post => <TradeCard key={post.id} post={post} />)}</div>}{!loading && hasMore && <button className="trade-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle size={15} className="trade-spin" /> : <ChevronDown size={15} />}{loadingMore ? "불러오는 중" : "모집 글 더 보기"}</button>}
    </section>
    <details className="trade-panel trade-owned" ref={ownSection}>
      <summary><span>내가 올린 글</span><span>{ownedReady ? `${ownedCount}/${TRADE_OWNER_LIMIT}개 · 이 기기` : "불러오는 중"}</span></summary>
      <p className="trade-small-note">작성한 브라우저에서 접수 상태를 확인하고 모집을 마감·삭제할 수 있어요. 응답을 받지 못한 작성 기록도 보관하고, 다시 접속하면 접수 상태를 확인해요. 관리 정보는 공개하지 않아요.</p>
      {storageWarning && <p className="trade-storage-warning" role="status">{storageWarning}</p>}{ownedError && <p className="trade-error" role="alert">{ownedError}</p>}
      {owned.length > 0 ? <><div className="trade-owned-toolbar"><button className="trade-secondary-button" type="button" disabled={refreshingOwned || !!managing} onClick={() => void refreshOwned()}>{refreshingOwned ? <LoaderCircle size={15} className="trade-spin" /> : <RefreshCw size={15} />}접수 상태 새로고침</button></div>
        <div className="trade-owned-list">{owned.map(item => {
          const post = item.post, status = post ? shownStatus(post, now ?? Date.now()) : undefined;
          const busy = refreshingOwned || !!managing || activeJournalId === item.entryId;
          return <article key={item.entryId} className="trade-owned-card"><div>
            <span className={`trade-own-status trade-own-status-${status ?? "pending"}`}>{activeJournalId === item.entryId ? "접수 중" : status ? STATUS_LABELS[status] : "접수 확인 필요"}</span>
            {post ? <><h3>{speciesName(post.offer.speciesId)} <ArrowRight size={14} /> {speciesName(post.want.speciesId)}</h3><p className="trade-owned-background">GPS 위치 변경 · {post.gpsCapable === undefined ? "미지정" : post.gpsCapable ? "가능" : "불가능"}<br />줄 포켓몬: {tradeBackgroundLabel(post.offer.background)}<br />원하는 포켓몬: {tradeBackgroundLabel(post.want.background)}</p><p>{cityName(post.cityId)} · {post.mode === "local" ? "대면 교환" : "리모트 교환 준비"} · {expiryLabel(post.expiresAt)}까지</p></> : <><h3>접수 확인이 필요한 작성 기록</h3><p>서버 접수 여부를 아직 확인하지 못했어요. 기록을 유지한 채 다시 확인할 수 있어요.</p></>}
          </div><div className="trade-owned-actions">
            {!post && <button type="button" disabled={busy} onClick={() => void refreshOwned(item.entryId)}>접수 상태 다시 확인</button>}
            {(status === "pending" || status === "approved") && <button type="button" disabled={busy} onClick={() => setConfirmation({ id: item.entryId, action: "close" })}>{status === "pending" ? "접수 취소" : "모집 마감"}</button>}
            {post && <button type="button" className="trade-delete" disabled={busy} onClick={() => setConfirmation({ id: item.entryId, action: "delete" })}><Trash2 size={13} />삭제</button>}
            {(!post || status === "expired" || status === "closed" || status === "removed" || status === "rejected") && <button type="button" disabled={busy} onClick={() => setConfirmation({ id: item.entryId, action: "forget" })}>기기 기록 지우기</button>}
          </div>{confirmation?.id === item.entryId && <div className="trade-owner-confirm">
            <p>{confirmation.action === "forget" ? !post ? "아직 서버 접수 여부를 확인하지 못했어요. 기록을 지우면 이미 접수된 글이 있어도 직접 관리할 수 없어요. 이 기기의 작성 기록만 지울까요?" : "이 기기의 관리 기록만 지울까요? 서버의 글은 삭제되지 않으며, 이후 이 글을 직접 관리할 수 없어요." : confirmation.action === "delete" ? "글과 연락 방법을 삭제할까요? 이 기기의 관리 목록에서도 지워져요." : "모집을 마감할까요? 공개 목록에 더 이상 표시되지 않아요."}</p>
            <button type="button" disabled={!!managing} onClick={() => void manage(item.entryId, confirmation.action)}>{managing === item.entryId ? "처리 중" : confirmation.action === "forget" ? "기기 기록 지우기" : confirmation.action === "delete" ? "삭제하기" : "마감하기"}</button><button type="button" disabled={!!managing} onClick={() => setConfirmation(null)}>돌아가기</button>
          </div>}</article>;
        })}</div></> : ownedReady ? <p className="trade-muted">이 브라우저에서 작성한 글이 아직 없어요.</p> : <p className="trade-muted">관리 정보를 불러오고 있어요.</p>}
    </details>
    <p className="trade-catalog-note">배경 목록을 자동으로 갱신해요.{catalog.sourceUpdatedAt && <> · 자료 기준 {catalog.sourceUpdatedAt}</>}{catalog.stale && catalog.fetchedAt && <> · 마지막 확인 목록</>} <a href={catalog.source} target="_blank" rel="noreferrer">배경 자료 출처</a></p><details className="trade-panel trade-submission" ref={submission} open={formOpen} onToggle={event => { setFormOpen(event.currentTarget.open); if (event.currentTarget.open) setFormWasOpened(true); }}><summary><span><Plus size={17} />교환 모집 글 올리기</span><span>{formOpen ? "접기" : "열기"}</span></summary>{(formOpen || formWasOpened) && <TradeForm defaultCity={filters.city} canPost={ownedReady && ownedCount < TRADE_OWNER_LIMIT} onCreated={addOwned} onJournalSaved={journalSaved} onWarning={storageWarningFor} onSendingChange={submissionSending} />}</details>
    <footer className="trade-footer"><p>이 게시판은 교환 상대를 찾는 도구예요. 포켓몬 보유 여부·친구 단계·별의모래·게임 내 교환 가능 여부를 인증하지 않아요. 구체적인 조건은 상대와 게임에서 확인해 주세요.</p><p>모집 마감 시각은 한국시간(KST)으로 표시해요.</p><a href="/privacy">이용 통계와 제보 안내</a>{!storageWritable && <p>브라우저 저장 공간과 설정을 확인해 주세요. 접수 여부를 확인하지 못한 작성 기록은 자동으로 지우지 않아요.</p>}</footer>
    </main></div></LanguageScope>;
}

export default function TradeBoard() { return <LanguageScope><TradeBackgroundCatalogProvider><TradeBoardContent /></TradeBackgroundCatalogProvider></LanguageScope>; }
