import { LanguageScope } from "@/components/pokedoko/LanguageProvider";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES } from "@/lib/cities";
import { loadFeed } from "@/lib/feed";
import { withOfficialEvents } from "@/lib/official-events";
import { describeOffset, eventWindow, formatKst } from "@/lib/raid-time";
import { cityPath, EVENT_KIND_KO, eventPath, indexableEvent, pageMetadata } from "@/lib/site-metadata";
import CoordinateCopyButton from "@/components/pokedoko/CoordinateCopyButton";
import "../../seo.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const city = CITIES.find(item => item.id === id);
  if (!city) return { title: "도시를 찾을 수 없습니다 | pokedoko", robots: { index: false, follow: false } };
  return pageMetadata({ title: `${city.name} 포켓몬 GO 레이드·추천 장소`, description: `${city.country} ${city.name}의 확인된 레이드·이벤트 일정과 현지 시각(${city.zone}), 한국시간을 비교하세요. 사용자 추천 장소 ${city.spots.length}곳의 좌표와 추천 근거도 확인할 수 있습니다.`, path: cityPath(id) });
}

export default async function CityPage({ params }: Props) {
  const { id } = await params;
  const city = CITIES.find(item => item.id === id);
  if (!city) notFound();
  const feed = await loadFeed();
  const now = new Date();
  const events = withOfficialEvents(feed.events).filter(indexableEvent).flatMap(event => {
    const window = eventWindow(event, city);
    return window && window.end > now ? [{ event, window }] : [];
  }).sort((a, b) => a.window.start.getTime() - b.window.start.getTime()).slice(0, 8);
  const localNow = new Intl.DateTimeFormat("ko-KR", { timeZone: city.zone, dateStyle: "full", timeStyle: "short" }).format(now);

  return <LanguageScope>{<div className="seo-page">
    <header className="seo-top"><div className="seo-top-inner"><a className="seo-brand" href="/">poke<span>doko</span></a><nav className="seo-nav" aria-label="주요 메뉴"><a href="/live">실시간 레이드</a><a href="/raids">레이드 시간표</a><a href="/calendar">이벤트 캘린더</a></nav></div></header>
    <main className="seo-content">
      <nav className="seo-breadcrumb" aria-label="현재 위치"><a href="/">홈</a><span>/</span><span>도시별 안내</span><span>/</span><span>{city.name}</span></nav>
      <section className="seo-hero"><p className="seo-eyebrow">{city.country} · {city.nameEn}</p><h1>{city.name} 포켓몬 GO<br />레이드·추천 장소</h1><p className="seo-lead">현지 시각과 한국시간으로 확인된 이벤트를 비교하고, 사용자 추천 장소 {city.spots.length}곳의 좌표와 원문을 확인하세요.</p><div className="seo-actions"><a className="seo-button primary" href={`/live?city=${city.id}`}>{city.name} 실시간 레이드</a><a className="seo-button" href={`/raids?city=${city.id}`}>레이드 시간표</a><a className="seo-button" href={`/calendar?city=${city.id}`}>이벤트 캘린더</a></div></section>
      {feed.error && <p className="seo-note">일부 일정 갱신이 지연되어 마지막 확인 자료를 표시합니다. 각 이벤트의 원문도 확인하세요.</p>}
      <div className="seo-layout"><div>
        <section className="seo-card"><h2>사용자 추천 장소 {city.spots.length}곳</h2><p>추천 글에서 확인한 장소와 대표 좌표입니다. 현재 체육관 수·레이드 발생·참가 인원을 보장하지 않습니다.</p><ol className="seo-spot-list">{city.spots.map(spot => <li key={spot.name}><h3>{spot.name}</h3>{spot.note && <p>{spot.note}</p>}<code className="seo-coordinate">{spot.lat},{spot.lon}</code><CoordinateCopyButton lat={spot.lat} lon={spot.lon} name={spot.name} city={city.id} /><div className="seo-source-links">{spot.sourceUrl && <a href={spot.sourceUrl} target="_blank" rel="noopener noreferrer">사용자 추천 원문 ↗</a>}{spot.coordinateSource && <a href={spot.coordinateSource} target="_blank" rel="noopener noreferrer">좌표 근거 ↗</a>}</div></li>)}</ol></section>
        <section className="seo-card"><h2>{city.name} 기준 현재·예정 이벤트</h2>{events.length ? <ul className="seo-links">{events.map(({ event, window }) => <li key={event.id}><a href={eventPath(event.id)}>{event.nameKo}</a><small>{EVENT_KIND_KO[event.kind]} · {window.start <= now ? "진행 중" : "예정"}</small><small>한국시간 {formatKst(window.start)} ~ {formatKst(window.end)}</small></li>)}</ul> : <p>현재 자료에 확인된 진행·예정 일정이 없습니다. 요일이나 작년 날짜로 다음 행사를 만들지 않습니다.</p>}<p className="seo-muted">이벤트 운영 시간과 실제 체육관 레이드 운영은 다릅니다. 확인된 현지 일정은 {city.zone} 시간대로 해석합니다.</p></section>
      </div><aside>
        <section className="seo-card"><h2>{city.name} 시간 기준</h2><dl className="seo-facts"><div><dt>페이지를 연 시점의 현지 시각</dt><dd>{localNow}</dd></div><div><dt>IANA 시간대</dt><dd><code>{city.zone}</code></dd></div><div><dt>한국과 시차</dt><dd>{describeOffset(city, now)}</dd></div><div><dt>도시 중심 대표 좌표</dt><dd><code>{city.lat},{city.lon}</code></dd></div></dl><p className="seo-muted">서머타임을 적용하는 도시는 날짜에 따라 시차가 바뀝니다. 실시간 화면에서 현재 시각을 계속 확인할 수 있습니다.</p></section>
        <section className="seo-card"><h2>자료를 읽는 방법</h2><p>실시간 레이드는 공개 공급원이 확인한 체육관 자료입니다. 조회 범위와 자료 시각을 함께 확인하세요. 자료가 없다는 이유만으로 도시 전체의 레이드가 없다고 판단하지 않습니다.</p><p>레이드 로비의 실제 참가 인원이나 모집 상태는 제공되지 않으므로 추정하지 않습니다.</p></section>
        <section className="seo-card"><h2>다른 도시</h2><div className="seo-city-grid">{CITIES.filter(item => item.id !== city.id).map(item => <a key={item.id} href={cityPath(item.id)}>{item.name}</a>)}</div></section>
      </aside></div>
    </main>
  </div>}</LanguageScope>;
}
