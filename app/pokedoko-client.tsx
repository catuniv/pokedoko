"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  Egg,
  Globe2,
  Info,
  LocateFixed,
  MapPin,
  Radio,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Star,
  Swords,
  X,
} from "lucide-react";
import { FALLBACK_FEED } from "@/lib/feed";
import { availableRaidEvents, nextRaidEvent } from "@/lib/feed-availability";
import { parseShareState } from "@/lib/share-state";
import { cityPath } from "@/lib/site-metadata";
import { CITIES } from "@/lib/cities";
import {
  countdown,
  eventWindow,
  formatKst,
  formatLocal,
  getCityWindows,
  getGymState,
  localToInstant,
} from "@/lib/raid-time";
import type { City, Feed, GymObservation, Region } from "@/lib/pokedoko-types";
import map from "@/lib/world-map.json";
import EventCalendar from "@/components/pokedoko/EventCalendar";
import PokemonAvailability from "@/components/pokedoko/PokemonAvailability";
import LiveRaids from "@/components/pokedoko/LiveRaids";
import CoordinateCopyButton from "@/components/pokedoko/CoordinateCopyButton";
import ShareButton, { useSharedUrlState } from "@/components/pokedoko/ShareButton";

type View = "live" | "raids" | "calendar" | "pokemon";
const NAV = [
  { id: "live", label: "실시간 레이드", icon: Radio },
  { id: "raids", label: "레이드아워", icon: Swords },
  { id: "calendar", label: "이벤트 캘린더", icon: CalendarDays },
  { id: "pokemon", label: "등장 포켓몬", icon: Sparkles },
] as const;
const REGIONS: { id: Region | "all"; label: string }[] = [
  { id: "all", label: "전 세계" },
  { id: "asia", label: "아시아" },
  { id: "oceania", label: "오세아니아" },
  { id: "europe", label: "유럽" },
  { id: "america", label: "아메리카" },
  { id: "africa", label: "아프리카" },
];
const COPY = {
  live: ["실시간 레이드", "체육관별 진행 상황과 다음 부화 시간을 확인하세요."],
  raids: [
    "레이드아워 시간표",
    "도시별 레이드아워·레이드데이 시작 시간을 한국시간으로 확인하세요.",
  ],
  calendar: ["이벤트 캘린더", "날짜별 이벤트 일정과 등장 포켓몬을 확인하세요."],
  pokemon: [
    "등장 포켓몬",
    "현재·예정 포켓몬과 확인된 등장 기간을 확인하세요.",
  ],
};
const SOURCE = "https://github.com/bigfoott/ScrapedDuck";
function flag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
function stored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep current state if storage is unavailable. */
  }
}
function isObservation(v: unknown): v is GymObservation {
  if (!v || typeof v !== "object") return false;
  const o = v as GymObservation;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.pokemonName === "string" &&
    CITIES.some((c) => c.id === o.cityId) &&
    Number.isFinite(Date.parse(o.startsAt)) &&
    (o.endsAt === null || Number.isFinite(Date.parse(o.endsAt)))
  );
}

export default function Pokedoko({
  initialView = "live",
}: {
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView),
    [now, setNow] = useState<Date | null>(null),
    [feed, setFeed] = useState<Feed>(FALLBACK_FEED),
    [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(""),
    [region, setRegion] = useState<Region | "all">("all"),
    [status, setStatus] = useState("all"),
    [favoriteOnly, setFavoriteOnly] = useState(false),
    [favorites, setFavorites] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("seoul"),
    [selectedEventId, setSelectedEventId] = useState(""),
    [observations, setObservations] = useState<GymObservation[]>([]),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState(""),
    [gymForm, setGymForm] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [sort, setSort] = useState<"next" | "spots">("next");
  const requestId = useRef(0);
  const clock = now ?? new Date(FALLBACK_FEED.fetchedAt);
  const city = CITIES.find((c) => c.id === selectedCity) ?? CITIES[0];
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const r = await fetch("/api/feed", { cache: "no-store" });
      if (!r.ok) throw Error();
      const next: Feed = await r.json();
      if (!Array.isArray(next.events) || !Array.isArray(next.bosses))
        throw Error();
      if (id === requestId.current) setFeed(next);
    } catch {
      if (id === requestId.current)
        setFeed((p) => ({
          ...p,
          cached: true,
          error: "갱신에 실패했습니다. 마지막 확인 자료를 표시합니다.",
        }));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    const fromUrl = () => {
      const v = new URLSearchParams(location.search).get("view");
      const path = location.pathname.split("/")[1];
      const current = v || path;
      setView(
        NAV.some((n) => n.id === current) ? (current as View) : initialView,
      );
    };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    const fs = stored("pokedoko.favorites");
    if (Array.isArray(fs))
      setFavorites(
        fs.filter(
          (x): x is string =>
            typeof x === "string" && CITIES.some((c) => c.id === x),
        ),
      );
    const gs = stored("pokedoko.gyms");
    if (Array.isArray(gs)) setObservations(gs.filter(isObservation));
    setReady(true);
    void refresh();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 300000);
    const onVisible = () => { if (document.visibilityState === "visible") { setNow(new Date()); void refresh(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("popstate", fromUrl);
      requestId.current++;
    };
  }, [refresh, initialView]);
  useEffect(() => {
    if (ready) {
      save("pokedoko.favorites", favorites);
      save("pokedoko.gyms", observations);
    }
  }, [favorites, observations, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === view)?.label} · pokedoko`;
  }, [view]);
  const raidEvents = feed.events
    .filter((e) => e.kind === "raid-hour" || e.kind === "raid-day")
    .sort((a, b) => a.start.value.localeCompare(b.start.value));
  const available = availableRaidEvents(raidEvents, CITIES, clock);
  const event = nextRaidEvent(raidEvents, CITIES, clock, selectedEventId);
  useSharedUrlState(view, { city: selectedCity, event: view === "raids" ? event?.id : undefined }, (shared) => {
    setSelectedCity(shared.city ?? "seoul");
    setSelectedEventId(shared.event ?? "");
  });
  // IANA databases can differ between the server and a browser. Calculate the
  // moving world clock after hydration so both initial renders stay identical.
  if (!now)
    return (
      <div className="pokedoko-shell">
        <aside className="sidebar">
          <a className="brand" href="/live">
            <span className="brand-orb" />
            <span>
              poke<strong>doko</strong>
              <i>POKÉMON GO PLANNER</i>
            </span>
          </a>
        </aside>
        <div className="workspace">
          <main className="page">
            <div className="page-heading">
              <h1>pokedoko</h1>
            </div>
            <div className="panel" role="status">
              불러오는 중…
            </div>
          </main>
        </div>
      </div>
    );
  function navigate(v: View) {
    setView(v);
    const destination = new URL(`/${v}`, location.origin);
    if (selectedCity !== "seoul") destination.searchParams.set("city", selectedCity);
    const campaign = parseShareState(location.search, CITIES.map((city) => city.id)).from;
    if (campaign) destination.searchParams.set("from", campaign);
    history.pushState(null, "", destination.pathname + destination.search);
    window.dispatchEvent(new CustomEvent("pokedoko:navigate", { detail: { view: v } }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function favorite(id: string) {
    setFavorites((xs) =>
      xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id],
    );
  }
  const rows = CITIES.map((c) => {
    const w = event ? eventWindow(event, c) : null;
    return {
      city: c,
      window: w,
      state: !w
        ? "unknown"
        : clock < w.start
          ? "upcoming"
          : clock < w.end
            ? "live"
            : "ended",
    };
  });
  const active = rows.filter((r) => r.state === "live"),
    upcoming = rows
      .filter((r) => r.state === "upcoming")
      .sort((a, b) => a.window!.start.getTime() - b.window!.start.getTime());
  const filtered = rows
    .filter(
      (r) =>
        (region === "all" || r.city.region === region) &&
        (status === "all" || r.state === status) &&
        (!favoriteOnly || favorites.includes(r.city.id)) &&
        `${r.city.name} ${r.city.nameEn} ${r.city.country}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "spots"
        ? b.city.spots.length - a.city.spots.length
        : (a.state === "live" ? 0 : a.state === "upcoming" ? 1 : 2) -
            (b.state === "live" ? 0 : b.state === "upcoming" ? 1 : 2) ||
          (a.window?.start.getTime() ?? Infinity) -
            (b.window?.start.getTime() ?? Infinity),
    );
  const rounds = getCityWindows(city, raidEvents, clock).slice(0, 3);
  return (
    <div className="pokedoko-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/live"
          onClick={(e) => {
            e.preventDefault();
            navigate("live");
          }}
        >
          <span className="brand-orb" />
          <span>
            poke<strong>doko</strong>
            <i>POKÉMON GO PLANNER</i>
          </span>
        </a>
        <div className="sidebar-caption">포켓몬 GO</div>
        <nav aria-label="주 메뉴">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "nav-link active" : "nav-link"}
              onClick={() => navigate(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              data-tab={n.id}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "raids" && <span className="nav-dot" />}
            </button>
          ))}
          <a className="nav-link" href={`/gpx?city=${encodeURIComponent(selectedCity)}`}><Route size={19} />GPX 자동사냥</a>
        </nav>
        <div className="sidebar-caption saved-caption">나의 플래너</div>
        <div className="community-side-links"><a className="nav-link" href={`/routes?city=${encodeURIComponent(selectedCity)}`}><MapPin size={18} />지가르데 셀 루트</a><a className="nav-link" href={`/trades?city=${encodeURIComponent(selectedCity)}`}><ArrowDownUp size={18} />포켓몬 교환</a></div>
        <button
          className="nav-link"
          onClick={() => {
            navigate("raids");
            setFavoriteOnly(true);
          }}
        >
          <Star size={18} />
          즐겨찾는 도시<span className="nav-count">{favorites.length}</span>
        </button>
        <button
          className="nav-link"
          onClick={() => {
            navigate("live");
            setTimeout(
              () =>
                document
                  .getElementById("gym-timers")
                  ?.scrollIntoView({ behavior: "smooth" }),
              60,
            );
          }}
        >
          <Egg size={19} />
          체육관 타이머<span className="nav-count">{observations.length}</span>
        </button>
        <div className="sidebar-note">
          <div className="orbit-decoration">✦</div>
          <span>
            도시별 시간은
            <br />
            한국시간 기준
          </span>
          <small>KST로 보는 포켓몬 GO</small>
        </div>
        <a
          className="source-side"
          href={SOURCE}
          target="_blank"
          rel="noreferrer"
        >
          데이터 출처 <ArrowUpRight size={14} />
        </a>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            플래너 <ChevronRight size={14} />
            <strong>{NAV.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="header-actions">
            <span className="timezone-pill">
              <Globe2 size={14} />
              Asia / Seoul
            </span>
            <button
              className="icon-button"
              aria-label="시간과 데이터 안내"
              onClick={() => setInfoOpen(true)}
            >
              <Info size={19} />
            </button>
            <span className="trainer-avatar">P</span>
          </div>
        </header>
        <main className="page">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                <span />
                POKÉMON GO, AROUND THE WORLD
              </span>
              <h1>{COPY[view][0]}</h1>
              <p>{COPY[view][1]}</p>
              <ShareButton view={view} city={selectedCity} state={view === "raids" ? { event: event?.id } : {}} />
            </div>
            <div className="korean-clock">
              <div>
                <Clock3 size={15} />
                한국 표준시 <b>KST</b>
              </div>
              <strong suppressHydrationWarning>
                {now ? formatLocal(now, "Asia/Seoul") : "--:--:--"}
              </strong>
              <span>
                {new Intl.DateTimeFormat("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                }).format(clock)}
              </span>
            </div>
          </div>
          {view !== "live" && (
            <div className={`feed-note ${feed.cached ? "is-cached" : ""}`}>
              <span>
                <i />
                {feed.cached ? "보관된 자료" : "커뮤니티 자료"} ·{" "}
                {feed.error ?? `조회 ${formatKst(new Date(feed.fetchedAt))}`}
              </span>
              <button onClick={() => void refresh()} disabled={loading}>
                <RefreshCw size={13} className={loading ? "spinning" : ""} />
                {loading ? "불러오는 중" : "새로고침"}
              </button>
            </div>
          )}
          {view === "live" ? (
            <LiveRaids
              now={clock}
              city={city}
              onCityChange={setSelectedCity}
              observations={observations}
              onAdd={() => setGymForm(true)}
              onDelete={(id) =>
                setObservations((xs) => xs.filter((o) => o.id !== id))
              }
              onSchedule={() => navigate("raids")}
            />
          ) : view === "calendar" ? (
            <EventCalendar events={feed.events} now={clock} city={city} />
          ) : view === "pokemon" ? (
            <PokemonAvailability feed={feed} now={clock} city={city} />
          ) : (
            <>
              <section className="event-band">
                <div className="event-band-icon">
                  <Swords size={24} />
                </div>
                <div>
                  <span>선택한 공식 일정</span>
                  <h2>{event?.nameKo ?? "확인된 레이드 일정 없음"}</h2>
                  <p>
                    {!event ? "진행 중이거나 예정된 확정 일정이 없습니다. 새 공지를 확인하면 자동으로 표시합니다." : event.start.kind === "local"
                      ? "각 도시의 현지 시각에 진행 · 한국시간으로 변환"
                      : "동시에 시작하는 일정 · 한국시간으로 변환"}
                  </p>
                </div>
                <select
                  aria-label="레이드 이벤트 선택"
                  value={event?.id ?? ""}
                  disabled={!available.length}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  {!available.length && <option value="">확정 일정 없음</option>}
                  {available.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.nameKo}
                    </option>
                  ))}
                </select>
                {event && (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noreferrer"
                    className="event-source"
                  >
                    <ArrowUpRight size={17} />
                    <span>일정 원문</span>
                  </a>
                )}
              </section>
              <div className="metrics">
                <article>
                  <span>
                    <Radio size={16} />
                    일정 진행 도시
                  </span>
                  <strong>
                    {active.length}
                    <small> / {CITIES.length}</small>
                  </strong>
                  <p>선택한 일정의 현지 운영시간 기준</p>
                </article>
                <article>
                  <span>
                    <Clock3 size={16} />
                    다음 시작까지
                  </span>
                  <strong className="count-number">
                    {upcoming[0]
                      ? countdown(
                          upcoming[0].window!.start.getTime() - clock.getTime(),
                        )
                      : "다음 공지 대기"}
                  </strong>
                  <p>
                    {upcoming[0]
                      ? `${flag(upcoming[0].city.countryCode)} ${upcoming[0].city.name} · ${formatKst(upcoming[0].window!.start, false)}`
                      : "확인된 다음 일정 없음"}
                  </p>
                </article>
                <article>
                  <span>
                    <MapPin size={16} />
                    추천 스팟
                  </span>
                  <strong>
                    {CITIES.reduce((n, c) => n + c.spots.length, 0)}
                    <small>곳</small>
                  </strong>
                  <p>대표 장소 목록 · 실제 체육관 수 아님</p>
                </article>
                <article>
                  <span>
                    <Egg size={16} />
                    나의 부화 대기
                  </span>
                  <strong>
                    {
                      observations.filter(
                        (o) => getGymState(o, clock) === "waiting",
                      ).length
                    }
                    <small>개</small>
                  </strong>
                  <p>직접 확인하고 등록한 체육관</p>
                </article>
              </div>
              <div className="map-layout">
                <section className="panel world-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="mini-label">WORLD RAID WINDOW</span>
                      <h2>레이드아워 시간대 지도</h2>
                    </div>
                    <span className="live-label">
                      <i />
                      시간대 자동 계산
                    </span>
                  </div>
                  <div className="map-legend">
                    <span>
                      <i className="dot mint" />
                      일정 진행
                    </span>
                    <span>
                      <i className="dot gold" />
                      시작 예정
                    </span>
                    <span>
                      <i className="dot gray" />
                      선택 일정 종료
                    </span>
                  </div>
                  <svg
                    className="world-map"
                    viewBox="0 0 1000 470"
                    role="group"
                    aria-label="세계 도시별 선택한 레이드 일정"
                  >
                    <defs>
                      <pattern
                        id="grid"
                        width="55.55"
                        height="55.3"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M55.55 0H0V55.3"
                          fill="none"
                          stroke="var(--line)"
                          strokeWidth=".8"
                          strokeDasharray="2 4"
                        />
                      </pattern>
                    </defs>
                    <rect width="1000" height="470" fill="url(#grid)" />
                    {map.paths.map((d, i) => (
                      <path key={i} d={d} className="land" />
                    ))}
                    {rows.map((r) => {
                      const x = ((r.city.lon + 180) * 1000) / 360,
                        y = ((85 - r.city.lat) * 470) / 170;
                      return (
                        <g
                          key={r.city.id}
                          transform={`translate(${x},${y})`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${r.city.name} ${r.state === "live" ? "일정 진행" : "시간 확인"}`}
                          className={`map-pin ${r.state}${selectedCity === r.city.id ? " selected" : ""}`}
                          onClick={() => setSelectedCity(r.city.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedCity(r.city.id);
                            }
                          }}
                        >
                          <circle className="pin-halo" r="14" />
                          <circle className="pin-core" r="5" />
                          {selectedCity === r.city.id && (
                            <>
                              <rect
                                x="-42"
                                y="-43"
                                width="84"
                                height="26"
                                rx="7"
                              />
                              <text textAnchor="middle" y="-25">
                                {r.city.name}
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  <div className="map-bottom">
                    <span>
                      <LocateFixed size={15} />
                      {flag(city.countryCode)} {city.name} 선택됨
                    </span>
                    <small>
                      공식 일정 시간대 기준 · 체육관별 실황은 실시간 레이드에서
                      확인
                    </small>
                  </div>
                </section>
                <aside className="panel next-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="mini-label">UP NEXT</span>
                      <h2>다음 시작 도시</h2>
                    </div>
                    <Compass size={22} />
                  </div>
                  {upcoming.slice(0, 4).map((r, i) => (
                    <button
                      className="next-city"
                      key={r.city.id}
                      onClick={() => setSelectedCity(r.city.id)}
                    >
                      <span className="ranking">{i + 1}</span>
                      <span>
                        <strong>
                          {flag(r.city.countryCode)} {r.city.name}
                        </strong>
                        <small>
                          {r.city.country} · KST{" "}
                          {formatKst(r.window!.start, false)}
                        </small>
                      </span>
                      <b>
                        {countdown(r.window!.start.getTime() - clock.getTime())}
                      </b>
                    </button>
                  ))}
                  {!upcoming.length && (
                    <p className="empty-small">확인된 다음 일정이 없습니다.</p>
                  )}
                  <div className="next-tip">
                    <Sparkles size={17} />
                    <p>도시 선택: 다음 회차와 추천 장소 표시</p>
                  </div>
                </aside>
              </div>
              <section className="panel city-panel">
                <div className="panel-heading">
                  <div>
                    <span className="mini-label">FOLLOW THE SUN</span>
                    <h2>
                      도시별 레이드 타임보드 <small>{filtered.length}</small>
                    </h2>
                  </div>
                  <button
                    className={`subtle-button ${favoriteOnly ? "is-on" : ""}`}
                    onClick={() => setFavoriteOnly(!favoriteOnly)}
                  >
                    <Star
                      size={15}
                      fill={favoriteOnly ? "currentColor" : "none"}
                    />
                    즐겨찾기
                  </button>
                </div>
                <div className="table-controls">
                  <div className="region-tabs">
                    {REGIONS.map((r) => (
                      <button
                        className={region === r.id ? "selected" : ""}
                        onClick={() => setRegion(r.id)}
                        key={r.id}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="filter-controls">
                    <label className="search-box">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="도시 또는 국가 검색"
                        aria-label="도시 또는 국가 검색"
                      />
                      {query && (
                        <button
                          aria-label="검색 지우기"
                          onClick={() => setQuery("")}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </label>
                    <select
                      aria-label="진행 상태"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">모든 상태</option>
                      <option value="live">일정 진행</option>
                      <option value="upcoming">시작 예정</option>
                      <option value="ended">종료</option>
                    </select>
                    <button
                      className="sort-button"
                      onClick={() =>
                        setSort(sort === "next" ? "spots" : "next")
                      }
                    >
                      <ArrowDownUp size={14} />
                      {sort === "next" ? "시간순" : "등록 스팟순"}
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>도시 / 국가</th>
                        <th>현지 시각</th>
                        <th>선택 일정 (한국시간)</th>
                        <th>시작 / 종료까지</th>
                        <th>추천 스팟</th>
                        <th>
                          <Star size={14} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr
                          key={r.city.id}
                          className={
                            selectedCity === r.city.id ? "selected" : ""
                          }
                        >
                          <td>
                            <button
                              className="city-name"
                              onClick={() => setSelectedCity(r.city.id)}
                            >
                              <span className="flag">
                                {flag(r.city.countryCode)}
                              </span>
                              <span>
                                <strong>{r.city.name}</strong>
                                <small>
                                  {r.city.country} · {r.city.nameEn}
                                </small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <strong className="time-mono">
                              {formatLocal(clock, r.city.zone)}
                            </strong>
                            <small className="zone-name">{r.city.zone}</small>
                          </td>
                          <td>
                            {r.window ? (
                              <>
                                <strong>{formatKst(r.window.start)}</strong>
                                <small className="zone-name">
                                  ~ {formatKst(r.window.end, false)}
                                </small>
                              </>
                            ) : (
                              <span>확인할 일정 없음</span>
                            )}
                          </td>
                          <td>
                            <span className={`state-chip ${r.state}`}>
                              <i />
                              {r.state === "live"
                                ? "일정 진행"
                                : r.state === "upcoming"
                                  ? "시작 예정"
                                  : r.state === "ended"
                                    ? "종료"
                                    : "확인 필요"}
                            </span>
                            <small className="zone-name time-mono">
                              {r.window &&
                                (r.state === "live"
                                  ? `${countdown(r.window.end.getTime() - clock.getTime())} 남음`
                                  : r.state === "upcoming"
                                    ? countdown(
                                        r.window.start.getTime() -
                                          clock.getTime(),
                                      )
                                    : "다음 회차 확인")}
                            </small>
                          </td>
                          <td>
                            <button
                              className="spot-count"
                              onClick={() => setSelectedCity(r.city.id)}
                            >
                              <MapPin size={14} />
                              {r.city.spots.length}곳<ChevronRight size={13} />
                            </button>
                          </td>
                          <td>
                            <button
                              className="star-button"
                              onClick={() => favorite(r.city.id)}
                              aria-label={`${r.city.name} 즐겨찾기 ${favorites.includes(r.city.id) ? "해제" : "추가"}`}
                              aria-pressed={favorites.includes(r.city.id)}
                            >
                              <Star
                                size={17}
                                fill={
                                  favorites.includes(r.city.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty-state">
                    <Search size={28} />
                    <h3>조건에 맞는 도시가 없어요</h3>
                    <p>검색어나 지역, 즐겨찾기 필터를 바꿔보세요.</p>
                    <button
                      onClick={() => {
                        setQuery("");
                        setRegion("all");
                        setStatus("all");
                        setFavoriteOnly(false);
                      }}
                    >
                      필터 초기화
                    </button>
                  </div>
                )}
                <div className="table-foot">
                  국가마다 시간대가 다를 수 있어 대표 도시를 기준으로 계산해요.
                  서머타임은 자동 반영돼요.
                </div>
              </section>
              <div className="details-layout">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="mini-label">YOUR NEXT ROUND</span>
                      <h2>{city.name}의 다음 공식 회차</h2>
                    </div>
                    <span className="city-mini-flag">
                      {flag(city.countryCode)}
                    </span>
                  </div>
                  <div className="rounds">
                    {rounds.map((r, i) => (
                      <a
                        href={r.event.url}
                        key={r.event.id}
                        target="_blank"
                        rel="noreferrer"
                        className="round"
                      >
                        <span
                          className={
                            r.active ? "round-number live" : "round-number"
                          }
                        >
                          {i + 1}
                        </span>
                        <div>
                          <strong>{r.event.nameKo}</strong>
                          <p>
                            {formatKst(r.start)} ~ {formatKst(r.end, false)} KST
                          </p>
                          <small>
                            {r.active ? "진행 중 · 종료까지" : "시작까지"}{" "}
                            {countdown(
                              (r.active ? r.end : r.start).getTime() -
                                clock.getTime(),
                            )}
                          </small>
                        </div>
                        <ArrowUpRight size={16} />
                      </a>
                    ))}
                    {!rounds.length && (
                      <p className="empty-small">
                        확인된 다음 회차가 없습니다.
                      </p>
                    )}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="mini-label">PLACES TO EXPLORE</span>
                      <h2>
                        {city.name} 추천 스팟{" "}
                        <small className="spot-count">
                          {city.spots.length}곳
                        </small>
                      </h2>
                    </div>
                    <a className="page-detail-link" href={cityPath(city.id)}>도시 안내 <ArrowUpRight size={15} /></a>
                  </div>
                  {city.spots.map((s) => (
                    <div className="spot-row" key={s.name}>
                      <div className="spot-icon">
                        <MapPin size={18} />
                      </div>
                      <div className="spot-meta">
                        <strong>{s.name}</strong>
                        <small>
                          {s.lat},{s.lon}
                        </small>
                        {s.note && <p className="spot-note">{s.note}</p>}
                        {s.sourceUrl && (
                          <div className="spot-sources">
                            <a
                              href={s.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              추천 근거 <ArrowUpRight size={12} />
                            </a>
                            {s.coordinateSource && (
                              <a
                                href={s.coordinateSource}
                                target="_blank"
                                rel="noreferrer"
                              >
                                좌표 근거 <ArrowUpRight size={12} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      <CoordinateCopyButton
                        lat={s.lat}
                        lon={s.lon}
                        name={s.name}
                        city={city.id}
                      />
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${s.name} 지도 열기`}
                      >
                        <ArrowUpRight size={17} />
                      </a>
                    </div>
                  ))}
                  <p className="panel-caption">
                    장소의 대표 좌표입니다. 개별 체육관 위치나 현재 레이드
                    밀집도를 뜻하지 않습니다.
                  </p>
                </section>
              </div>
            </>
          )}
          <footer className="footer">
            <span className="footer-brand">
              pokedoko<span>포켓몬 GO 일정 · 한국시간 기준</span>
            </span>
            <p>
              <a href="https://leekduck.com" target="_blank" rel="noreferrer">
                LeekDuck
              </a>{" "}
              ·{" "}
              <a href={SOURCE} target="_blank" rel="noreferrer">
                ScrapedDuck
              </a>{" "}
              커뮤니티 일정 /{" "}
              <a
                href="https://pokemongo.com/news"
                target="_blank"
                rel="noreferrer"
              >
                Pokémon GO 공식 공지
              </a>{" "}
              / 지도 Natural Earth
            </p>
            <small>
              비공식 팬 프로젝트입니다. Pokémon과 관련 명칭·이미지의 권리는 해당
              권리자에게 있습니다. 일정은 변경될 수 있습니다.
            </small>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {gymForm && (
        <GymForm
          city={city}
          onClose={() => setGymForm(false)}
          onSave={(o) => {
            setObservations((xs) => [...xs, o]);
            setGymForm(false);
            setToast("체육관 기록을 저장했습니다.");
          }}
        />
      )}
      {infoOpen && (
        <Modal title="시간 및 데이터 안내" onClose={() => setInfoOpen(false)}>
          <div className="info-copy">
            <h3>한국시간(KST) 기준</h3>
            <p>도시별 현지 날짜와 서머타임을 반영해 한국시간으로 변환합니다.</p>
            <h3>레이드아워와 실시간 레이드</h3>
            <p>
              레이드아워는 공식 일정의 시간표입니다. 실시간 레이드는 체육관별
              관측 자료와 직접 등록한 기록을 구분해 표시합니다.
            </p>
            <h3>다음 회차와 부화 시간</h3>
            <p>
              공식 공지로 확인한 회차와 사용자가 기록한 부화·종료 시각만
              표시합니다.
            </p>
            <h3>추천 장소와 밀집도</h3>
            <p>
              추천 장소는 정적 목록입니다. 실시간 페이지의 집계는 연결된
              공급원의 유효한 관측 자료만 포함하며, 전 세계 전체 수를 뜻하지
              않습니다.
            </p>
          </div>
          <button
            className="primary-button modal-confirm"
            onClick={() => setInfoOpen(false)}
          >
            확인
          </button>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>(".gym-form input")?.focus();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function GymForm({
  city,
  onClose,
  onSave,
}: {
  city: City;
  onClose: () => void;
  onSave: (o: GymObservation) => void;
}) {
  const [name, setName] = useState(""),
    [starts, setStarts] = useState(""),
    [ends, setEnds] = useState(""),
    [pokemon, setPokemon] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal title={`${city.name} 체육관 시간 등록`} onClose={onClose}>
      <form
        className="gym-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            if (!name.trim()) throw Error("체육관 이름을 입력하세요.");
            const start = localToInstant(starts, "Asia/Seoul"),
              end = ends ? localToInstant(ends, "Asia/Seoul") : null;
            if (
              !Number.isFinite(start.getTime()) ||
              (end && !Number.isFinite(end.getTime()))
            )
              throw Error("날짜와 시간을 확인해주세요.");
            if (end && end <= start)
              throw Error("종료 시각은 시작 시각보다 늦어야 합니다.");
            onSave({
              id: crypto.randomUUID(),
              name: name.trim(),
              cityId: city.id,
              startsAt: start.toISOString(),
              endsAt: end?.toISOString() ?? null,
              recordedAt: new Date().toISOString(),
              pokemonName: pokemon.trim(),
            });
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "시간을 확인해주세요.",
            );
          }
        }}
      >
        <p>
          직접 확인한 시각을 입력하세요. 입력 기준은{" "}
          <strong>한국시간(KST)</strong>입니다.
        </p>
        <label>
          체육관 이름
          <input
            autoFocus
            required
            maxLength={70}
            placeholder="예: 센트럴 파크 분수"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          알 부화 / 레이드 시작 시각
          <input
            type="datetime-local"
            required
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
          />
        </label>
        <label>
          확인한 종료 시각 <small>선택</small>
          <input
            type="datetime-local"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
          />
        </label>
        <label>
          보스 이름 <small>선택</small>
          <input
            maxLength={50}
            placeholder="아직 모르면 비워두세요"
            value={pokemon}
            onChange={(e) => setPokemon(e.target.value)}
          />
        </label>
        <p className="form-note">
          종료 시각이 없으면 진행 여부를 확정하지 않습니다. 기록은 이 브라우저에
          저장됩니다.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button">
            기록 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
