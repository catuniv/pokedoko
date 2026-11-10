"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Search, Sparkles, X } from "lucide-react";
import type { City, Feed, Pokemon } from "@/lib/pokedoko-types";
import { eventWindow, formatKst, localParts } from "@/lib/raid-time";
import { bossWindow, classifyBoss, pokemonIdentity } from "@/lib/feed-availability";
import "./pokemon.css";

type Props = { feed: Feed; now: Date; city: City };
type Entry = {
  pokemon: Pokemon;
  raid: boolean;
  event: boolean;
  tiers: string[];
  confirmed: boolean;
  availability: "current" | "upcoming" | "unknown";
  sources: { name: string; url: string; start?: Date; until?: Date }[];
};
type Tab = "all" | "raid" | "event" | "upcoming" | "unknown";
const TYPE_KO: Record<string, string> = {
  normal: "노말",
  fire: "불꽃",
  water: "물",
  electric: "전기",
  grass: "풀",
  ice: "얼음",
  fighting: "격투",
  poison: "독",
  ground: "땅",
  flying: "비행",
  psychic: "에스퍼",
  bug: "벌레",
  rock: "바위",
  ghost: "고스트",
  dragon: "드래곤",
  dark: "악",
  steel: "강철",
  fairy: "페어리",
};

export default function PokemonAvailability({ feed, now, city }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tier, setTier] = useState("all");
  const entries = useMemo(() => {
    const merged = new Map<string, Entry>();
    function add(pokemon: Pokemon, source: Entry["sources"][number], availability: Entry["availability"], raid: boolean, event: boolean, tier?: string) {
      const key = `${availability}:${pokemonIdentity(pokemon)}`;
      const existing = merged.get(key);
      if (existing) {
        existing.raid ||= raid;
        existing.event ||= event;
        existing.confirmed ||= availability !== "unknown";
        if (tier && !existing.tiers.includes(tier)) existing.tiers.push(tier);
        if (!existing.sources.some((item) => item.url === source.url && item.start?.getTime() === source.start?.getTime())) existing.sources.push(source);
        if (pokemon.shiny) existing.pokemon = { ...existing.pokemon, shiny: true };
      } else merged.set(key, { pokemon, raid, event, tiers: tier ? [tier] : [], confirmed: availability !== "unknown", availability, sources: [source] });
    }
    feed.bosses.forEach((boss) => {
      const availability = classifyBoss(boss, city, now);
      if (availability === "expired") return;
      const window = bossWindow(boss, city);
      add(boss, {
        name: availability === "unknown" ? "최근 게시 · 기간 미확인" : availability === "upcoming" ? "예정 레이드" : "레이드 등장 기간 확인",
        url: boss.sourceUrl || feed.sourceUrl,
        start: window?.start, until: window?.end,
      }, availability, true, false, boss.tier);
    });
    feed.events.forEach((event) => {
      const window = eventWindow(event, city);
      if (!window || window.end <= now) return;
      const availability = window.start > now ? "upcoming" : "current";
      event.pokemon.forEach((pokemon) => add(pokemon, {
        name: event.nameKo || event.name, url: event.url, start: window.start, until: window.end,
      }, availability, event.kind === "raid-hour" || event.kind === "raid-day", true));
    });
    for (const entry of merged.values())
      entry.sources.sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));
    return [...merged.entries()].sort(([, a], [, b]) => {
      const start = (entry: Entry) => Math.min(...entry.sources.map((source) => source.start?.getTime() ?? Infinity));
      return start(a) - start(b) || a.pokemon.name.localeCompare(b.pokemon.name);
    });
  }, [feed.bosses, feed.events, feed.sourceUrl, city, now]);
  const currentEntries = entries.filter(([, item]) => item.availability === "current");
  const upcomingEntries = entries.filter(([, item]) => item.availability === "upcoming");
  const unknownEntries = entries.filter(([, item]) => item.availability === "unknown");
  const tabEntries = tab === "upcoming" ? upcomingEntries : tab === "unknown" ? unknownEntries : currentEntries;
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/^#/, "");
  const tiers = [...new Set(tabEntries.flatMap(([, item]) => item.tiers))];
  const visible = tabEntries.filter(
    ([, item]) =>
      (["all", "upcoming", "unknown"].includes(tab) ||
        (tab === "raid" && item.raid) ||
        (tab === "event" && item.event)) &&
      (tier === "all" || item.tiers.includes(tier)) &&
      (!normalizedQuery ||
        [
          item.pokemon.name,
          item.pokemon.nameKo,
          String(item.pokemon.id ?? ""),
        ].some((value) =>
          value.toLowerCase().replace(/\s/g, "").includes(normalizedQuery),
        )),
  );
  const eventPokemonCount = currentEntries.filter(([, item]) => item.event).length;
  useEffect(() => {
    if (selected && !visible.some(([key]) => key === selected)) setSelected(null);
  }, [selected, visible]);
  const localDate = (date: Date) => {
    const p = localParts(date, city.zone);
    return `${p.month}월 ${p.day}일 ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  };

  return (
    <section className="pokemon-availability" aria-label="등장 포켓몬">
      <div className="pokemon-heading">
        <div>
          <span className="pokemon-eyebrow">POKÉMON LIST</span>
          <h2>등장 포켓몬</h2>
        </div>
        <span className="pokemon-city-label">{city.name} 현지 일정 기준 · 매초 자동 판정</span>
      </div>
      <div className="pokemon-controls">
        <div className="pokemon-tabs" aria-label="포켓몬 목록 필터">
          {(
            [
              { key: "all", name: "현재 전체" },
              { key: "raid", name: "레이드" },
              { key: "event", name: "이벤트" },
              { key: "upcoming", name: "예정" },
              { key: "unknown", name: "기간 미확인" },
            ] as { key: Tab; name: string }[]
          ).map(({ key, name }) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              className={tab === key ? "is-active" : ""}
              onClick={() => {
                setTab(key);
                setTier("all");
                setSelected(null);
              }}
            >
              {name}
              <span>
                {key === "all" ? currentEntries.length : key === "raid" ? currentEntries.filter(([, item]) => item.raid).length : key === "event" ? eventPokemonCount : key === "upcoming" ? upcomingEntries.length : unknownEntries.length}
              </span>
            </button>
          ))}
        </div>
        <label className="pokemon-search">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder="이름 또는 도감 번호 검색"
            aria-label="포켓몬 한국어, 영어 이름 또는 도감 번호 검색"
          />
          {query && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => {
                setQuery("");
                setSelected(null);
              }}
            >
              <X size={15} />
            </button>
          )}
        </label>
      </div>
      <div className="pokemon-list-caption">
        <div>
          <span className="pokemon-status-dot" />
          <strong>{tab === "upcoming" ? "공개된 예정 포켓몬" : tab === "unknown" ? "등장 기간을 확인할 수 없는 보스" : tab === "event" ? "진행 중인 이벤트의 포켓몬" : "현재 일정의 포켓몬"}</strong>
          <span>{tab === "unknown" ? "현재 등장한다고 보장하지 않습니다" : "선택 도시의 시작·종료 시각을 자동 적용합니다"}</span>
        </div>
        {tab !== "event" && tiers.length > 1 && (
          <label className="pokemon-tier-filter">
            <select
              aria-label="레이드 등급 필터"
              value={tier}
              onChange={(event) => {
                setTier(event.target.value);
                setSelected(null);
              }}
            >
              <option value="all">모든 등급</option>
              {tiers.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        )}
      </div>
      {tab !== "upcoming" && upcomingEntries.length > 0 && (
        <button type="button" className="pokemon-upcoming-note" onClick={() => { setTab("upcoming"); setTier("all"); setSelected(null); }}>
          <span><strong>예정 포켓몬 {upcomingEntries.length}종</strong><span>{upcomingEntries.slice(0, 3).map(([, item]) => item.pokemon.nameKo || item.pokemon.name).join(" · ")}</span></span>
          <span>일정 보기 <ArrowUpRight size={15} /></span>
        </button>
      )}
      {tab === "event" && eventPokemonCount === 0 && (
        <div className="pokemon-source-note"><Sparkles size={15} /><p>현재 이벤트에 공개된 포켓몬 목록이 없습니다. 예정 일정은 ‘예정’에서 확인하세요.</p></div>
      )}
      {tab === "unknown" && <div className="pokemon-source-note"><p>최근 게시된 목록이지만 시작·종료일이 확인되지 않았습니다. 원문에서 기간을 확인하세요.</p></div>}
      {visible.length > 0 ? (
        <div className="pokemon-grid">
          {visible.map(([key, item]) => {
            const expanded = selected === key;
            const toggleId = `pokemon-toggle-${encodeURIComponent(key)}`;
            const panelId = `pokemon-detail-${encodeURIComponent(key)}`;
            return (
              <article
                key={key}
                className={`pokemon-card ${expanded ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="pokemon-card-toggle"
                  id={toggleId}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setSelected(expanded ? null : key)}
                >
                  <span className="pokemon-card-top">
                    <span>
                      {item.pokemon.id
                        ? `No. ${String(item.pokemon.id).padStart(4, "0")}`
                        : "POKÉMON"}
                    </span>
                    {item.pokemon.shiny && (
                      <span
                        className="pokemon-shiny"
                        title="색이 다른 모습 등장 가능"
                      >
                        <Sparkles size={12} />
                      </span>
                    )}
                  </span>
                  <span className="pokemon-art">
                    {item.pokemon.image ? (
                      <img
                        src={item.pokemon.image}
                        alt={item.pokemon.nameKo || item.pokemon.name}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.opacity = "0";
                        }}
                      />
                    ) : (
                      <span className="pokemon-art-fallback">?</span>
                    )}
                  </span>
                  <strong>{item.pokemon.nameKo || item.pokemon.name}</strong>
                  {item.pokemon.nameKo &&
                    item.pokemon.name !== item.pokemon.nameKo && (
                      <span className="pokemon-english-name">
                        {item.pokemon.name}
                      </span>
                    )}
                  <span className="pokemon-card-tags">
                    {item.tiers.slice(0, 1).map((value) => (
                      <span key={value}>{value}</span>
                    ))}
                    {item.event && (
                      <span className="pokemon-event-tag">이벤트</span>
                    )}
                  </span>
                  <span className={`pokemon-confirmed pokemon-availability-${item.availability}`}>
                    {item.availability === "upcoming" ? "예정 · 기간 확인" : item.availability === "unknown" ? "기간 미확인" : "현재 · 기간 확인"}
                  </span>
                  {item.availability === "upcoming" && item.sources[0]?.start && <span className="pokemon-start-date">KST {formatKst(item.sources[0].start)}</span>}
                  <span className="pokemon-card-detail">
                    {expanded ? "상세 접기" : "자세히 보기"}
                    <ChevronDown size={12} />
                  </span>
                </button>
                <div
                  className="pokemon-detail"
                  id={panelId}
                  role="region"
                  aria-labelledby={toggleId}
                  hidden={!expanded}
                >
                  <div className="pokemon-detail-title">
                    <h3>상세 정보</h3>
                    <button
                      type="button"
                      aria-label="포켓몬 상세 정보 닫기"
                      onClick={() => {
                        setSelected(null);
                        document.getElementById(toggleId)?.focus();
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="pokemon-detail-content">
                    <div className="pokemon-detail-description">
                      <p>
                        {item.pokemon.shiny
                          ? "색이 다른 모습 등장 가능"
                          : "색이 다른 모습의 등장 여부는 원문에서 확인하세요."}
                      </p>
                      {item.pokemon.types.length > 0 && (
                        <div className="pokemon-types">
                          {item.pokemon.types.map((type) => (
                            <span key={type}>
                              {TYPE_KO[type.toLowerCase()] || type}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.availability === "unknown" && (
                        <small>
                          등장 기간이 확인되지 않은 보스입니다. 현재 체육관에 등장하는지는 이 목록으로 판단할 수 없습니다.
                        </small>
                      )}
                    </div>
                    <div className="pokemon-detail-sources">
                      {item.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>
                            <strong>{source.name}</strong>
                            {source.start && source.until && <small>한국시간 {formatKst(source.start)} ~ {formatKst(source.until)}</small>}
                            {source.start && source.until && <small>{city.name} 현지 {localDate(source.start)} ~ {localDate(source.until)}</small>}
                          </span>
                          <ArrowUpRight size={15} />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="pokemon-empty">
          <Search size={28} />
          <h3>
            {query ? "검색 결과 없음" : "표시할 포켓몬 정보 없음"}
          </h3>
          <p>
            {query
              ? "한국어·영어 이름 또는 도감 번호로 검색하세요."
              : tab === "unknown" ? "기간 미확인 보스가 없습니다." : tab === "upcoming" ? "확인된 예정 포켓몬이 없습니다." : "현재 등장 기간이 확인된 포켓몬이 없습니다. 예정·기간 미확인 목록을 확인하세요."}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTier("all");
                setSelected(null);
              }}
            >
              검색 초기화
            </button>
          )}
        </div>
      )}
      <p className="pokemon-bottom-note">
        포켓몬 이미지는 각 권리자에게 귀속됩니다. 일정과 등장 정보는 공개 출처를
        기준으로 제공합니다.
      </p>
    </section>
  );
}
