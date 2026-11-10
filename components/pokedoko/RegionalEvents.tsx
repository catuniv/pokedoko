"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, Clock3, ExternalLink, Globe2, ImageOff, MapPin, Search, Sparkles, X } from "lucide-react";
import { REGIONAL_EVENTS } from "@/lib/regional-events-data";
import { formatRegionalDates, regionalEventStatus, regionalText } from "@/lib/regional-events";
import type { RegionalEvent, RegionalEventStatus, RegionalReward } from "@/lib/regional-event-types";
import { TRADE_BACKGROUND_PRESETS } from "@/lib/trade-backgrounds";
import { tradeBackgroundImage, tradeBackgroundImageStyle } from "@/lib/trade-background-image";
import { tradeSpeciesLocalizedName } from "@/lib/trade-pokemon-search";
import { useLanguage } from "./LanguageProvider";
import CoordinateCopyButton from "./CoordinateCopyButton";
import "./regional-events.css";

const COPY = {
  ko: {
    nav: "주요 메뉴", live: "실시간 레이드", calendar: "이벤트 달력", routes: "지가르데 셀 루트", trades: "교환 상대 찾기", regional: "지역 한정 이벤트",
    eyebrow: "POKÉMON GO · LOCAL EXCLUSIVES", title: "나라별 한정 이벤트\n코스튬·배경 포켓몬", intro: "나라와 도시마다 다른 코스튬과 배경. 받을 수 있는 포켓몬부터 장소와 조건까지 한눈에 확인하세요.",
    countries: "국가·지역", events: "이벤트", allCountries: "모든 국가·지역", period: "기간", all: "전체", ongoing: "기간 중", upcoming: "예정", ended: "종료", search: "도시, 포켓몬, 코스튬 검색", clear: "검색어 지우기", results: "개 이벤트", noResults: "조건에 맞는 이벤트가 없어요", noResultsBody: "국가나 기간을 바꾸거나 다른 검색어로 찾아보세요.", reset: "필터 초기화",
    background: "로케이션 배경", noBackgroundArt: "배경 이미지 미확보", noPokemonArt: "포켓몬 이미지 미확보", noCostumeArt: "해당 코스튬 이미지 미확보", plain: "일반 모습", guaranteed: "조건 달성 시 배경 확정", possible: "배경은 확률 획득", unknown: "배경 확률 미공개", noBackground: "배경 보상 미확인", rewardMethod: "획득 방법", eventPeriod: "현지 날짜", localTime: "현지 시간", hoursUnknown: "세부 시간은 공식 공지 확인", venue: "행사 장소", reference: "지역 참고 위치", referenceNote: "이 좌표는 지역 참고점이에요. 실제 스탬프·보상 위치는 게임과 공지에서 확인하세요.", map: "지도", details: "참여 조건·출처", verified: "공식 공지 기준", checked: "확인", source: "공식 공지", coordinateSource: "장소 출처", note: "기간 중 표시는 현지 날짜 기준이에요. 좌표에 있는 것만으로 보상을 받을 수 있는 것은 아니며, 티켓·리서치 등 참여 조건을 확인하세요.", footer: "공식 공지로 확인한 지역 이벤트를 모았어요. 등장과 배경 획득은 게임 내 조건을 따르며, 새 공지와 변경 사항은 원문을 확인하세요.", dates: "기간별 이벤트", costume: "코스튬", imageNote: "포켓몬과 배경을 함께 보여주는 조합 미리보기예요. 획득 화면은 게임에서 확인하세요.",
  },
  en: {
    nav: "Main navigation", live: "Live raids", calendar: "Event calendar", routes: "Zygarde routes", trades: "Find a trade", regional: "Regional events",
    eyebrow: "POKÉMON GO · LOCAL EXCLUSIVES", title: "Regional Pokémon events\nCostumes & backgrounds", intro: "Explore location-exclusive costumes and backgrounds, with the Pokémon, places and requirements in one view.",
    countries: "Countries & regions", events: "Events", allCountries: "All countries & regions", period: "Period", all: "All", ongoing: "In date range", upcoming: "Upcoming", ended: "Ended", search: "Search city, Pokémon or costume", clear: "Clear search", results: "events", noResults: "No events match these filters", noResultsBody: "Try another country, period or search term.", reset: "Reset filters",
    background: "Location Background", noBackgroundArt: "Background image unavailable", noPokemonArt: "Pokémon image unavailable", noCostumeArt: "Exact costume image unavailable", plain: "Standard appearance", guaranteed: "Background after requirements are met", possible: "Chance of a background", unknown: "Background odds not published", noBackground: "Background reward unconfirmed", rewardMethod: "How to obtain", eventPeriod: "Local dates", localTime: "Local time", hoursUnknown: "Check the official notice for exact hours", venue: "Event venue", reference: "Area reference point", referenceNote: "These coordinates are an area reference. Check the game and official notice for actual stamp and reward locations.", map: "Map", details: "Requirements & sources", verified: "Official announcement", checked: "Checked", source: "Official notice", coordinateSource: "Venue source", note: "Date status uses local calendar dates, not live availability. Being at a coordinate does not guarantee a reward; check ticket, research and other requirements.", footer: "Regional events verified against official announcements. Encounters and backgrounds follow in-game requirements. Check the source for changes and new notices.", dates: "Events by period", costume: "Costume", imageNote: "This is a composition preview of the Pokémon and background. Check the game for the actual encounter screen.",
  },
  "zh-CN": {
    nav: "主导航", live: "实时团体战", calendar: "活动日历", routes: "基格尔德路线", trades: "寻找交换对象", regional: "地区限定活动",
    eyebrow: "POKÉMON GO · LOCAL EXCLUSIVES", title: "地区限定活动\n特别服装与背景宝可梦", intro: "查看各国家和城市限定的服装与背景，一次了解奖励宝可梦、地点和参加条件。",
    countries: "国家与地区", events: "活动", allCountries: "所有国家与地区", period: "期间", all: "全部", ongoing: "日期范围内", upcoming: "即将开始", ended: "已结束", search: "搜索城市、宝可梦或服装", clear: "清除搜索", results: "项活动", noResults: "没有符合条件的活动", noResultsBody: "试试其他国家、期间或搜索词。", reset: "重置筛选",
    background: "地点背景", noBackgroundArt: "尚无背景图片", noPokemonArt: "尚无宝可梦图片", noCostumeArt: "尚无该服装的准确图片", plain: "普通外观", guaranteed: "满足条件后保证获得背景", possible: "有机会获得背景", unknown: "背景概率未公布", noBackground: "尚未确认背景奖励", rewardMethod: "获得方式", eventPeriod: "当地日期", localTime: "当地时间", hoursUnknown: "具体时间请查看官方公告", venue: "活动场地", reference: "地区参考点", referenceNote: "此坐标仅为地区参考点。实际印章和奖励位置请查看游戏及官方公告。", map: "地图", details: "参加条件与来源", verified: "根据官方公告", checked: "核查于", source: "官方公告", coordinateSource: "地点来源", note: "日期状态按当地日期计算，不代表实时可获得奖励。到达坐标不保证获得奖励，请确认门票、调查等条件。", footer: "收录根据官方公告核实的地区活动。宝可梦出现与背景获得以游戏内条件为准，变更及新公告请查看原文。", dates: "按期间查看活动", costume: "服装", imageNote: "这是宝可梦与背景的组合预览，实际画面请在游戏中确认。",
  },
  ja: {
    nav: "メインメニュー", live: "リアルタイムレイド", calendar: "イベントカレンダー", routes: "ジガルデのルート", trades: "交換相手を探す", regional: "地域限定イベント",
    eyebrow: "POKÉMON GO · LOCAL EXCLUSIVES", title: "地域限定イベント\n衣装・背景付きポケモン", intro: "国や都市ごとの限定衣装と背景。出会えるポケモン、場所、参加条件をまとめて確認できます。",
    countries: "国と地域", events: "イベント", allCountries: "すべての国と地域", period: "期間", all: "すべて", ongoing: "開催期間内", upcoming: "開催予定", ended: "終了", search: "都市・ポケモン・衣装を検索", clear: "検索をクリア", results: "件のイベント", noResults: "条件に合うイベントはありません", noResultsBody: "国、期間、検索語を変えてみてください。", reset: "絞り込みをリセット",
    background: "ロケーション背景", noBackgroundArt: "背景画像は未取得", noPokemonArt: "ポケモン画像は未取得", noCostumeArt: "該当する衣装の画像は未取得", plain: "通常のすがた", guaranteed: "条件達成で背景確定", possible: "背景は確率で入手", unknown: "背景の確率は未公表", noBackground: "背景の報酬は未確認", rewardMethod: "入手方法", eventPeriod: "現地の日付", localTime: "現地時間", hoursUnknown: "詳しい時間は公式発表を確認", venue: "イベント会場", reference: "地域の参考地点", referenceNote: "この座標は地域の参考地点です。実際のスタンプや報酬の場所はゲームと公式発表で確認してください。", map: "地図", details: "参加条件・出典", verified: "公式発表に基づく情報", checked: "確認日", source: "公式発表", coordinateSource: "会場の出典", note: "期間の表示は現地の日付を基準とし、リアルタイムの出現を示しません。座標にいるだけで報酬が保証されるわけではありません。チケットやリサーチなどの条件を確認してください。", footer: "公式発表で確認した地域イベントを掲載しています。出現と背景の入手はゲーム内条件に従います。変更や新しい情報は原文をご確認ください。", dates: "期間でイベントを絞り込む", costume: "衣装", imageNote: "ポケモンと背景を組み合わせたプレビューです。実際の画面はゲーム内で確認してください。",
  },
} as const;
type Language = keyof typeof COPY;
type Labels = { [K in keyof typeof COPY.ko]: string };
type Period = "all" | RegionalEventStatus;
const EVENTS: readonly RegionalEvent[] = REGIONAL_EVENTS;

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, "");
function flag(code: string) { return /^[A-Z]{2}$/.test(code) ? [...code].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("") : "🌐"; }
function countryName(code: string, locale: string) {
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; } catch { return code; }
}
function checkedDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date) : value;
}
function rewardBackground(reward: RegionalReward) {
  const background = reward.background;
  if (background?.imageUrl) return { src: background.imageUrl, style: undefined as CSSProperties | undefined };
  const preset = TRADE_BACKGROUND_PRESETS.find(item => item.id === background?.localPresetId);
  const image = preset ? tradeBackgroundImage({ kind: preset.kind, name: preset.name }) : undefined;
  return image ? { src: image.src, style: tradeBackgroundImageStyle(image) as CSSProperties } : null;
}

function RewardPreview({ reward, language, copy, compact = false, city }: { reward: RegionalReward; language: Language; copy: Labels; compact?: boolean; city?: string }) {
  const background = rewardBackground(reward);
  const [failedSprite, setFailedSprite] = useState(""), [failedBackground, setFailedBackground] = useState("");
  const hasSprite = !!reward.spriteUrl && reward.spriteUrl !== failedSprite;
  const hasBackground = !!background && background.src !== failedBackground;
  const costume = reward.costume ? regionalText(reward.costume, language) : copy.plain;
  const localizedName = tradeSpeciesLocalizedName(reward.speciesId, language);
  return <figure className={`regional-reward${compact ? " regional-reward-compact" : ""}`}>
    <div className={`regional-reward-stage${hasBackground ? " has-background" : ""}`} data-background-image={hasBackground ? "available" : "unavailable"}>
      {hasBackground && <img className="regional-background-image" src={background.src} style={background.style} width={512} height={512} alt={reward.background?.name ?? ""} loading={compact ? "eager" : "lazy"} decoding="async" onError={() => setFailedBackground(background.src)} />}
      <div className="regional-pokemon-layer">
        {hasSprite ? <img src={reward.spriteUrl!} width={256} height={256} alt={`${reward.name} · ${costume}`} loading={compact ? "eager" : "lazy"} decoding="async" onError={() => setFailedSprite(reward.spriteUrl!)} /> : <div className="regional-image-missing"><ImageOff size={29} aria-hidden="true" /><span>{reward.costume ? copy.noCostumeArt : copy.noPokemonArt}</span></div>}
      </div>
      {!hasBackground && reward.background && <span className="regional-background-missing">{copy.noBackgroundArt}</span>}
      {!compact && reward.costume && <span className="regional-costume-tag"><Sparkles size={11} aria-hidden="true" />{copy.costume}</span>}
    </div>
    {compact ? <figcaption className="regional-hero-reward-caption"><strong>{city}</strong><span>{costume}</span></figcaption> : <figcaption className="regional-reward-caption">
      <strong lang="en">{reward.name}</strong>
      {localizedName !== reward.name && <span className="regional-native-name">{localizedName}</span>}
      <span className="regional-costume-name">{costume}</span>
      <div className="regional-background-name"><MapPin size={12} aria-hidden="true" /><span>{reward.background?.name ?? copy.noBackground}</span></div>
      {reward.background && <span className={`regional-chance regional-chance-${reward.backgroundChance}`}>{reward.backgroundChance === "guaranteed" ? <Check size={11} aria-hidden="true" /> : <Sparkles size={11} aria-hidden="true" />}{copy[reward.backgroundChance]}</span>}
      <p className="regional-reward-method"><span>{copy.rewardMethod}</span>{regionalText(reward.method, language)}</p>
    </figcaption>}
  </figure>;
}

function EventCard({ event, language, intlLocale, copy, now }: { event: RegionalEvent; language: Language; intlLocale: string; copy: Labels; now: Date }) {
  const status = regionalEventStatus(event, now);
  const coordinates = `${event.location.latitude},${event.location.longitude}`;
  return <article className={`regional-event-card regional-event-${status}`} id={event.id}>
    <div className="regional-card-heading"><span className="regional-card-place"><span aria-hidden="true">{flag(event.countryCode)}</span>{event.city}</span><span className={`regional-status regional-status-${status}`}><i aria-hidden="true" />{copy[status]}</span></div>
    <h2>{regionalText(event.title, language)}</h2>
    <div className={`regional-rewards${event.rewards.length > 1 ? " regional-rewards-pair" : ""}`}>
      {event.rewards.map((reward, index) => <RewardPreview key={`${event.id}-${reward.speciesId}-${index}`} reward={reward} language={language} copy={copy} />)}
    </div>
    <div className="regional-event-body">
      <dl className="regional-schedule"><div><dt><CalendarDays size={14} aria-hidden="true" />{copy.eventPeriod}</dt><dd>{formatRegionalDates(event, language)}</dd></div><div><dt><Clock3 size={14} aria-hidden="true" />{copy.localTime}</dt><dd>{event.schedule.hours ? `${event.schedule.hours.start}–${event.schedule.hours.end}` : <span className="regional-hours-note">{copy.hoursUnknown}</span>}<small>{event.schedule.timeZone.replace(/_/g, " ")}</small></dd></div></dl>
      <section className="regional-location" aria-label={copy[event.location.coordinateKind === "venue" ? "venue" : "reference"]}>
        <span className="regional-location-label"><MapPin size={12} aria-hidden="true" />{event.location.coordinateKind === "venue" ? copy.venue : copy.reference}</span>
        <strong>{event.location.name}</strong>
        <div className="regional-coordinate-row"><code translate="no">{coordinates}</code><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`} target="_blank" rel="noreferrer">{copy.map}<ExternalLink size={11} aria-hidden="true" /></a></div>
        <CoordinateCopyButton lat={event.location.latitude} lon={event.location.longitude} name={event.location.name} city={event.city} />
        {event.location.coordinateKind === "reference" && <p className="regional-reference-note">{copy.referenceNote}</p>}
      </section>
      <details className="regional-details"><summary>{copy.details}<ChevronDown size={16} aria-hidden="true" /></summary><div className="regional-details-content">
        <ul>{event.limitations.map((text, index) => <li key={index}>{regionalText(text, language)}</li>)}</ul>
        <div className="regional-source-links">{event.sources.map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer">{copy.source}{event.sources.length > 1 ? ` ${index + 1}` : ""}<ExternalLink size={11} aria-hidden="true" /></a>)}<a href={event.location.coordinateSourceUrl} target="_blank" rel="noreferrer">{copy.coordinateSource}<ExternalLink size={11} aria-hidden="true" /></a></div>
        <p className="regional-composition-note">{copy.imageNote}</p>
      </div></details>
      <p className="regional-checked"><Check size={12} aria-hidden="true" />{copy.verified}<span>{copy.checked} {checkedDate(event.checkedAt, intlLocale)}</span></p>
    </div>
  </article>;
}

export default function RegionalEvents() {
  const { language, intlLocale } = useLanguage();
  const copy = COPY[language];
  const [country, setCountry] = useState("all"), [period, setPeriod] = useState<Period>("all"), [query, setQuery] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const countries = useMemo(() => [...new Set(EVENTS.map(event => event.countryCode))].sort((a, b) => countryName(a, intlLocale).localeCompare(countryName(b, intlLocale), intlLocale)), [intlLocale]);
  const featured = useMemo(() => {
    const preferred = ["pokexciting-kuala-lumpur", "esa-london"];
    return EVENTS.filter(event => regionalEventStatus(event, now) !== "ended" && event.rewards.some(reward => reward.spriteUrl && rewardBackground(reward)))
      .sort((a, b) => (preferred.includes(a.id) ? preferred.indexOf(a.id) : preferred.length) - (preferred.includes(b.id) ? preferred.indexOf(b.id) : preferred.length))
      .slice(0, 2).map(event => ({ event, reward: event.rewards.find(reward => reward.spriteUrl && rewardBackground(reward))! }));
  }, [now]);
  const events = useMemo(() => {
    const term = normalized(query.trim());
    return EVENTS.filter(event => {
      if (country !== "all" && event.countryCode !== country || period !== "all" && regionalEventStatus(event, now) !== period) return false;
      if (!term) return true;
      const searchable = [event.city, event.location.name, event.countryCode, ...Object.values(event.title), ...["ko", "en", "zh-CN", "ja"].map(locale => countryName(event.countryCode, locale)), ...event.rewards.flatMap(reward => [reward.name, String(reward.speciesId), ...["ko", "en", "zh-CN", "ja"].map(locale => tradeSpeciesLocalizedName(reward.speciesId, locale)), ...Object.values(reward.costume ?? {}), reward.background?.name ?? ""])] .join(" ");
      return normalized(searchable).includes(term);
    }).sort((a, b) => {
      const order = { ongoing: 0, upcoming: 1, ended: 2 };
      const aStatus = regionalEventStatus(a, now), bStatus = regionalEventStatus(b, now);
      const statusOrder = order[aStatus] - order[bStatus];
      if (statusOrder) return statusOrder;
      if (aStatus === "ongoing") {
        const endOrder = (a.schedule.endDate ?? "9999-12-31").localeCompare(b.schedule.endDate ?? "9999-12-31");
        if (endOrder) return endOrder;
      }
      return a.schedule.startDate.localeCompare(b.schedule.startDate) || a.id.localeCompare(b.id);
    });
  }, [country, period, query, now]);
  function reset() { setCountry("all"); setPeriod("all"); setQuery(""); }
  return <div className="regional-page" data-i18n-preserve>
    <header className="regional-header"><a href="/live" className="regional-brand" aria-label="pokedoko"><span className="regional-brand-orb" aria-hidden="true" />poke<strong>doko</strong></a><nav aria-label={copy.nav}><a href="/live">{copy.live}</a><a href="/calendar">{copy.calendar}</a><a href="/routes">{copy.routes}</a><a href="/trades">{copy.trades}</a><a href="/regional" aria-current="page">{copy.regional}</a></nav></header>
    <main className="regional-main">
      <section className="regional-hero" aria-label={copy.regional}><div className="regional-hero-copy"><span className="regional-eyebrow"><Globe2 size={14} aria-hidden="true" />{copy.eyebrow}</span><h1>{copy.title.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1><p className="regional-intro">{copy.intro}</p></div><div className="regional-hero-showcase"><div className="regional-hero-rewards">{featured.map(({ event, reward }) => <RewardPreview key={event.id} reward={reward} language={language} copy={copy} compact city={event.city} />)}</div><div className="regional-hero-summary"><div><strong>{countries.length.toString().padStart(2, "0")}</strong><span>{copy.countries}</span></div><div><strong>{EVENTS.length.toString().padStart(2, "0")}</strong><span>{copy.events}</span></div></div></div></section>
      <section className="regional-filter-panel" aria-label={copy.dates}>
        <div className="regional-filter-top"><div className="regional-period-filters" role="group" aria-label={copy.period}>{(["all", "ongoing", "upcoming", "ended"] as const).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{copy[value]}</button>)}</div><label className="regional-search"><Search size={17} aria-hidden="true" /><span className="sr-only">{copy.search}</span><input type="search" placeholder={copy.search} value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label={copy.clear} onClick={() => setQuery("")}><X size={15} /></button>}</label></div>
        <div className="regional-country-filters" role="group" aria-label={copy.countries}><button type="button" aria-pressed={country === "all"} onClick={() => setCountry("all")}><Globe2 size={14} aria-hidden="true" />{copy.allCountries}</button>{countries.map(code => <button type="button" key={code} aria-pressed={country === code} onClick={() => setCountry(code)}><span aria-hidden="true">{flag(code)}</span>{countryName(code, intlLocale)}</button>)}</div>
      </section>
      <div className="regional-results-heading"><p aria-live="polite"><strong>{events.length}</strong> {copy.results}</p><span><Check size={13} aria-hidden="true" />{copy.verified}</span></div>
      <p className="regional-date-note"><Clock3 size={15} aria-hidden="true" />{copy.note}</p>
      {events.length ? <div className="regional-events-grid">{events.map(event => <EventCard key={event.id} event={event} language={language} intlLocale={intlLocale} copy={copy} now={now} />)}</div> : <div className="regional-empty"><Search size={30} aria-hidden="true" /><h2>{copy.noResults}</h2><p>{copy.noResultsBody}</p><button type="button" onClick={reset}>{copy.reset}<ArrowRight size={15} aria-hidden="true" /></button></div>}
      <footer className="regional-footer"><Globe2 size={16} aria-hidden="true" /><p>{copy.footer}</p></footer>
    </main>
  </div>;
}
