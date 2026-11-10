"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Search, Sparkles, X } from "lucide-react";
import type { City, Feed, Pokemon } from "@/lib/pokedoko-types";
import { eventWindow, formatKst } from "@/lib/raid-time";
import "./pokemon.css";

type Props = { feed: Feed; now: Date; city: City };
type Entry = {
  pokemon: Pokemon;
  raid: boolean;
  event: boolean;
  tiers: string[];
  confirmed: boolean;
  sources: { name: string; url: string; until?: Date }[];
};
type Tab = "all" | "raid" | "event";
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
  const activeEvents = useMemo(
    () =>
      feed.events.filter((event) => {
        const window = eventWindow(event, city);
        return window && window.start <= now && window.end > now;
      }),
    [feed.events, city, now],
  );
  const entries = useMemo(() => {
    const merged = new Map<string, Entry>();
    function add(
      pokemon: Pokemon,
      source: Entry["sources"][number],
      raid: boolean,
      tier?: string,
      confirmed = false,
    ) {
      const key = `${pokemon.id ?? pokemon.name.toLowerCase()}-${pokemon.form || pokemon.name.toLowerCase()}`;
      const existing = merged.get(key);
      if (existing) {
        existing.raid ||= raid;
        existing.event ||= !raid;
        existing.confirmed ||= confirmed;
        if (tier && !existing.tiers.includes(tier)) existing.tiers.push(tier);
        if (!existing.sources.some((item) => item.url === source.url))
          existing.sources.push(source);
        if (pokemon.shiny)
          existing.pokemon = { ...existing.pokemon, shiny: true };
      } else
        merged.set(key, {
          pokemon,
          raid,
          event: !raid,
          tiers: tier ? [tier] : [],
          confirmed,
          sources: [source],
        });
    }
    feed.bosses.forEach((boss) =>
      add(
        boss,
        {
          name: "최근 게시된 레이드 보스",
          url: boss.sourceUrl || feed.sourceUrl,
        },
        true,
        boss.tier,
        boss.confirmedWindow,
      ),
    );
    activeEvents.forEach((event) => {
      const until = eventWindow(event, city)?.end;
      event.pokemon.forEach((pokemon) =>
        add(
          pokemon,
          { name: event.nameKo || event.name, url: event.url, until },
          false,
        ),
      );
    });
    return [...merged.entries()];
  }, [feed.bosses, feed.sourceUrl, activeEvents, city]);
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/^#/, "");
  const tiers = [...new Set(feed.bosses.map((boss) => boss.tier))];
  const visible = entries.filter(
    ([, item]) =>
      (tab === "all" ||
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
  const eventPokemonCount = entries.filter(([, item]) => item.event).length;
  const selectedEntry = entries.find(([key]) => key === selected)?.[1];

  return (
    <section className="pokemon-availability" aria-label="등장 포켓몬">
      <div className="pokemon-heading">
        <div>
          <span className="pokemon-eyebrow">FIND YOUR NEXT CATCH</span>
          <h2>
            어떤 포켓몬을 만날까요<span>?</span>
          </h2>
        </div>
        <span className="pokemon-city-label">{city.name}의 이벤트 기준</span>
      </div>
      <div className="pokemon-controls">
        <div className="pokemon-tabs" aria-label="포켓몬 목록 필터">
          {(
            [
              { key: "all", name: "전체" },
              { key: "raid", name: "레이드" },
              { key: "event", name: "이벤트" },
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
                {key === "all"
                  ? entries.length
                  : key === "raid"
                    ? entries.filter(([, item]) => item.raid).length
                    : eventPokemonCount}
              </span>
            </button>
          ))}
        </div>
        <label className="pokemon-search">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름 또는 도감 번호 검색"
            aria-label="포켓몬 한국어, 영어 이름 또는 도감 번호 검색"
          />
          {query && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
      </div>
      <div className="pokemon-list-caption">
        <div>
          <span className="pokemon-status-dot" />
          <strong>
            {tab === "event"
              ? "진행 중인 이벤트의 포켓몬"
              : "최근 게시된 레이드 보스"}
          </strong>
          <span>
            {tab === "event"
              ? `${activeEvents.length}개의 진행 중인 이벤트 확인`
              : "보스별 등장 기간은 원문에서 확인해 주세요"}
          </span>
        </div>
        {tab !== "event" && tiers.length > 1 && (
          <label className="pokemon-tier-filter">
            <select
              aria-label="레이드 등급 필터"
              value={tier}
              onChange={(event) => setTier(event.target.value)}
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
      {tab !== "raid" && eventPokemonCount === 0 && (
        <div className="pokemon-source-note">
          <Sparkles size={15} />
          <p>
            이벤트별 등장 포켓몬 정보가 아직 제공되지 않았어요. 이벤트 원문에서
            상세 목록을 확인해 주세요.
          </p>
        </div>
      )}
      {visible.length > 0 ? (
        <div className="pokemon-grid">
          {visible.map(([key, item]) => (
            <button
              type="button"
              key={key}
              className={`pokemon-card ${selected === key ? "is-selected" : ""}`}
              aria-expanded={selected === key}
              onClick={() => setSelected(selected === key ? null : key)}
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
              {item.confirmed && (
                <span className="pokemon-confirmed">이벤트 기간 확인</span>
              )}
              <span className="pokemon-card-detail">
                자세히 보기 <ArrowUpRight size={12} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pokemon-empty">
          <Search size={28} />
          <h3>
            {query ? "찾는 포켓몬이 없어요" : "표시할 포켓몬 정보가 없어요"}
          </h3>
          <p>
            {query
              ? "한국어·영어 이름이나 도감 번호로 다시 검색해 보세요."
              : "새 정보가 공개되면 이곳에서 확인할 수 있어요."}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTier("all");
              }}
            >
              검색 초기화
            </button>
          )}
        </div>
      )}
      {selectedEntry && (
        <div className="pokemon-detail" aria-live="polite">
          <div className="pokemon-detail-title">
            <div>
              <span className="pokemon-eyebrow">POKÉMON DETAILS</span>
              <h3>
                {selectedEntry.pokemon.nameKo || selectedEntry.pokemon.name}
              </h3>
            </div>
            <button
              type="button"
              aria-label="포켓몬 상세 정보 닫기"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="pokemon-detail-content">
            <div className="pokemon-detail-description">
              <p>
                {selectedEntry.pokemon.shiny
                  ? "색이 다른 모습을 만날 가능성이 있어요."
                  : "색이 다른 모습의 등장 여부는 원문을 확인해 주세요."}
              </p>
              {selectedEntry.pokemon.types.length > 0 && (
                <div className="pokemon-types">
                  {selectedEntry.pokemon.types.map((type) => (
                    <span key={type}>
                      {TYPE_KO[type.toLowerCase()] || type}
                    </span>
                  ))}
                </div>
              )}
              {selectedEntry.raid && !selectedEntry.confirmed && (
                <small>
                  레이드 목록의 최근 게시 정보예요. 실제 체육관의 보스와 등장
                  기간은 다를 수 있어요.
                </small>
              )}
            </div>
            <div className="pokemon-detail-sources">
              {selectedEntry.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    <strong>{source.name}</strong>
                    {source.until && (
                      <small>
                        한국 시간 {formatKst(source.until, true)}까지
                      </small>
                    )}
                  </span>
                  <ArrowUpRight size={17} />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      <p className="pokemon-bottom-note">
        포켓몬 이미지는 각 권리자에게 귀속됩니다. 일정과 등장 정보는 공개 출처를
        기준으로 제공해요.
      </p>
    </section>
  );
}
