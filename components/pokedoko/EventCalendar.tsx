"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  X,
} from "lucide-react";
import type { City, EventKind, GoEvent } from "@/lib/pokedoko-types";
import { eventWindow, formatKst } from "@/lib/raid-time";
import "./calendar.css";

type Props = { events: GoEvent[]; now: Date; city: City };
type CalendarEvent = { event: GoEvent; start: Date; end: Date };
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const FILTERS: { key: "all" | EventKind; name: string }[] = [
  { key: "all", name: "전체" },
  { key: "raid-hour", name: "레이드 아워" },
  { key: "raid-day", name: "레이드 데이" },
  { key: "community-day", name: "커뮤니티 데이" },
  { key: "spotlight", name: "스포트라이트" },
  { key: "event", name: "기타 이벤트" },
];
const KIND_NAMES: Record<EventKind, string> = {
  "raid-hour": "레이드 아워",
  "raid-day": "레이드 데이",
  "community-day": "커뮤니티 데이",
  spotlight: "스포트라이트",
  event: "이벤트",
  research: "리서치",
};
const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const dateForKey = (key: string) => new Date(`${key}T00:00:00+09:00`);
const labelForDay = (key: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(dateForKey(key));
const localLabel = (date: Date, zone: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
const intersects = (item: CalendarEvent, key: string) => {
  const start = dateForKey(key).getTime();
  return (
    item.start.getTime() < start + 86_400_000 && item.end.getTime() > start
  );
};

export default function EventCalendar({ events, now, city }: Props) {
  const today = dayKey(now);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [filter, setFilter] = useState<"all" | EventKind>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const timedEvents = useMemo(
    () =>
      events
        .flatMap((event) => {
          const window = eventWindow(event, city);
          return window ? [{ event, ...window }] : [];
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events, city],
  );
  const filtered = timedEvents.filter(
    ({ event }) =>
      filter === "all" ||
      event.kind === filter ||
      (filter === "event" && event.kind === "research"),
  );
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const leading = (monthStart.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((leading + dayCount) / 7) * 7 },
    (_, index) => {
      const date = new Date(
        Date.UTC(year, monthNumber - 1, index - leading + 1),
      );
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        number: date.getUTCDate(),
        current: key.startsWith(month),
        items: filtered.filter((item) => intersects(item, key)),
      };
    },
  );
  const selectedEvents = filtered.filter((item) =>
    intersects(item, selectedDay),
  );
  const monthEventCount = filtered.filter((item) =>
    cells.some((cell) => cell.current && intersects(item, cell.key)),
  ).length;
  const nextEvent = filtered.find((item) => item.start > now);

  function goMonth(direction: number) {
    const value = new Date(Date.UTC(year, monthNumber - 1 + direction, 1))
      .toISOString()
      .slice(0, 7);
    setMonth(value);
    setSelectedDay(`${value}-01`);
    setDetailId(null);
  }
  function selectDay(key: string) {
    setSelectedDay(key);
    setMonth(key.slice(0, 7));
    setDetailId(null);
  }
  function goToday() {
    setMonth(today.slice(0, 7));
    setSelectedDay(today);
    setDetailId(null);
  }

  return (
    <section className="event-calendar" aria-label="포켓몬 GO 일정 달력">
      <div className="event-calendar-toolbar">
        <div>
          <span className="event-calendar-eyebrow">EVENT CALENDAR</span>
          <h2>이벤트 일정</h2>
        </div>
        <div className="event-calendar-zone">
          <MapPin size={15} />
          <span>{city.name} 일정 · 한국 시간 기준</span>
        </div>
      </div>
      <div className="event-calendar-filters" aria-label="이벤트 종류 필터">
        {FILTERS.map(({ key, name }) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "is-active" : ""}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setDetailId(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="event-calendar-layout">
        <div className="event-calendar-board">
          <div className="event-calendar-monthbar">
            <div className="event-calendar-month-title">
              <h3 data-testid="calendar-month">
                {year}년 {monthNumber}월
              </h3>
              <span>{monthEventCount}개의 일정</span>
            </div>
            <div className="event-calendar-navigation">
              <button
                type="button"
                onClick={goToday}
                className="event-calendar-today"
              >
                오늘
              </button>
              <button
                type="button"
                aria-label="이전 달"
                onClick={() => goMonth(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() => goMonth(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="event-calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div
            className="event-calendar-grid"
            aria-label={`${year}년 ${monthNumber}월 날짜 선택`}
          >
            {cells.map(({ key, number, current, items }) => (
              <button
                type="button"
                key={key}
                data-calendar-day={key}
                onClick={() => selectDay(key)}
                aria-label={`${labelForDay(key)}${key === today ? ", 오늘" : ""}, 일정 ${items.length}개`}
                aria-pressed={selectedDay === key}
                className={`event-calendar-day ${current ? "" : "is-outside"} ${key === today ? "is-today" : ""} ${selectedDay === key ? "is-selected" : ""}`}
              >
                <span className="event-calendar-day-number">{number}</span>
                <span className="event-calendar-day-events">
                  {items.slice(0, 2).map(({ event }) => (
                    <span
                      key={event.id}
                      className={`event-calendar-marker event-color-${event.kind}`}
                    >
                      <i /> <span>{event.nameKo || event.name}</span>
                    </span>
                  ))}
                  {items.length > 2 && (
                    <span className="event-calendar-more">
                      +{items.length - 2}개
                    </span>
                  )}
                </span>
                {items.length > 0 && (
                  <span
                    className="event-calendar-mobile-dots"
                    aria-hidden="true"
                  >
                    {items.slice(0, 3).map(({ event }) => (
                      <i
                        key={event.id}
                        className={`event-color-${event.kind}`}
                      />
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="event-calendar-footnote">
            <span>
              <i className="event-calendar-footnote-dot" />
              선택한 도시의 현지 일정을 한국시간으로 표시합니다.
            </span>
            <span>KST · UTC+9</span>
          </div>
        </div>
        <aside className="event-calendar-agenda" aria-live="polite">
          <div className="event-calendar-agenda-heading">
            <span className="event-calendar-eyebrow">SELECTED DATE</span>
            <h3>{labelForDay(selectedDay)}</h3>
            <span>
              일정 {selectedEvents.length}개
            </span>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="event-calendar-empty">
              <span className="event-calendar-empty-icon">
                <CalendarDays size={27} />
              </span>
              <h4>등록된 일정 없음</h4>
              <p>
                다른 날짜를 선택하거나
                <br />
                다음 일정을 확인하세요.
              </p>
              {nextEvent && (
                <button
                  type="button"
                  onClick={() => selectDay(dayKey(nextEvent.start))}
                >
                  다음 일정 보기 <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          ) : (
            <div className="event-calendar-agenda-list">
              {selectedEvents.map((item) => {
                const active = item.start <= now && item.end > now;
                const expanded = detailId === item.event.id;
                const toggleId = `event-toggle-${item.event.id}`;
                const panelId = `event-detail-${item.event.id}`;
                return (
                  <article
                    className={`event-calendar-event ${expanded ? "is-open" : ""}`}
                    key={item.event.id}
                  >
                    <button
                      type="button"
                      className="event-calendar-event-toggle"
                      id={toggleId}
                      onClick={() =>
                        setDetailId(expanded ? null : item.event.id)
                      }
                      aria-expanded={expanded}
                      aria-controls={panelId}
                    >
                      <span
                        className={`event-calendar-kind event-color-${item.event.kind}`}
                      >
                        {KIND_NAMES[item.event.kind]}
                      </span>
                      {active && (
                        <span className="event-calendar-live">진행 중</span>
                      )}
                      <strong>{item.event.nameKo || item.event.name}</strong>
                      <span className="event-calendar-event-time">
                        <Clock3 size={13} />
                        {formatKst(item.start, true)} –{" "}
                        {formatKst(item.end, true)} KST
                      </span>
                      <span className="event-calendar-event-more">
                        {expanded ? "상세 접기" : "상세 보기"}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                    <div
                      className="event-calendar-detail"
                      id={panelId}
                      role="region"
                      aria-labelledby={toggleId}
                      hidden={!expanded}
                    >
                      <div className="event-calendar-detail-top">
                        <h4>이벤트 정보</h4>
                        <button
                          type="button"
                          aria-label={`${item.event.nameKo || item.event.name} 상세 정보 닫기`}
                          onClick={() => {
                            setDetailId(null);
                            document.getElementById(toggleId)?.focus();
                          }}
                        >
                          <X size={17} />
                        </button>
                      </div>
                      {item.event.summary && <p>{item.event.summary}</p>}
                      <dl>
                        <div>
                          <dt>
                            한국시간
                            <br />(KST)
                          </dt>
                          <dd>
                            {localLabel(item.start, "Asia/Seoul")}
                            <br />~ {localLabel(item.end, "Asia/Seoul")}
                          </dd>
                        </div>
                        <div>
                          <dt>{city.name} 현지</dt>
                          <dd>
                            {localLabel(item.start, city.zone)}
                            <br />~ {localLabel(item.end, city.zone)}
                            <span className="event-calendar-detail-zone">
                              {city.zone}
                            </span>
                          </dd>
                        </div>
                      </dl>
                      {item.event.pokemon.length > 0 && (
                        <div className="event-calendar-detail-pokemon">
                          {item.event.pokemon.map((pokemon, index) => (
                            <span key={`${pokemon.name}-${index}`}>
                              {pokemon.image && (
                                <img
                                  src={pokemon.image}
                                  alt=""
                                  loading="lazy"
                                />
                              )}
                              <span>{pokemon.nameKo || pokemon.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <a href={item.event.url} target="_blank" rel="noreferrer">
                        이벤트 원문 <ArrowUpRight size={15} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
