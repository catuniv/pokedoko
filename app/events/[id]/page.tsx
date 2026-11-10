import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES } from "@/lib/cities";
import { loadFeed } from "@/lib/feed";
import { withOfficialEvents } from "@/lib/official-events";
import { eventWindow, formatKst } from "@/lib/raid-time";
import { EVENT_KIND_KO, eventPath, formatSourceTime, indexableEvent, pageMetadata, windowStatus } from "@/lib/site-metadata";
import { PokemonArtwork } from "@/components/pokedoko/PokemonArtwork";
import "../../seo.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
async function eventData(id: string) {
  const feed = await loadFeed();
  const events = withOfficialEvents(feed.events).filter(indexableEvent);
  const event = events.find(item => item.id === id);
  return { event, events, feed };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { event } = await eventData(id);
  if (!event) return { title: "이벤트를 찾을 수 없습니다 | pokedoko", robots: { index: false, follow: false } };
  return pageMetadata({ title: `${event.nameKo} 일정`, description: `${event.nameKo}의 확인된 시작·종료 시각과 등장 포켓몬을 확인하세요. ${event.start.kind === "local" ? "도시별 현지 시각과 한국시간을 구분해 제공합니다." : "전 세계 공통 시각을 한국시간으로 확인할 수 있습니다."}`, path: eventPath(id) });
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const { event, events, feed } = await eventData(id);
  if (!event) notFound();
  const now = new Date();
  const seoul = CITIES.find(city => city.id === "seoul")!;
  const koreaWindow = eventWindow(event, seoul);
  const status = koreaWindow ? windowStatus(koreaWindow.start, koreaWindow.end, now) : "unknown";
  const statusLabel = { ended: "한국시간 기준 종료된 일정", ongoing: "한국시간 기준 진행 중", upcoming: "한국시간 기준 예정", unknown: "시각 확인 필요" }[status];
  const comparisons = ["seoul", "tokyo", "new-york", "kiritimati", "honolulu"].flatMap(cityId => {
    const city = CITIES.find(item => item.id === cityId);
    const window = city ? eventWindow(event, city) : null;
    return city && window ? [{ city, window }] : [];
  });
  const upcoming = events.flatMap(item => {
    const window = eventWindow(item, seoul);
    return item.id !== event.id && window && window.start > now ? [{ event: item, window }] : [];
  }).sort((a, b) => a.window.start.getTime() - b.window.start.getTime()).slice(0, 3);

  return <div className="seo-page">
    <header className="seo-top"><div className="seo-top-inner"><a className="seo-brand" href="/">poke<span>doko</span></a><nav className="seo-nav" aria-label="주요 메뉴"><a href="/live">실시간 레이드</a><a href="/raids">레이드 시간표</a><a href="/calendar">이벤트 캘린더</a></nav></div></header>
    <main className="seo-content">
      <nav className="seo-breadcrumb" aria-label="현재 위치"><a href="/">홈</a><span>/</span><a href="/calendar">이벤트</a><span>/</span><span>상세</span></nav>
      <section className="seo-hero"><p className="seo-eyebrow">{EVENT_KIND_KO[event.kind]} · 확인된 일정</p><h1>{event.nameKo}</h1><span className={`seo-status ${status}`}>{statusLabel}</span><p className="seo-lead">{event.summary || "공개 원문에서 확인한 이벤트 일정과 등장 포켓몬입니다."}</p><div className="seo-actions"><a className="seo-button primary" href={`/calendar?event=${encodeURIComponent(id)}`}>달력에서 보기</a><a className="seo-button" href={`/raids?event=${encodeURIComponent(id)}`}>레이드 시간표 보기</a></div></section>
      {status === "ended" && <p className="seo-note history">종료된 일정의 기록입니다. 새로운 개최일이나 반복 일정으로 해석하지 마세요. 아래에서 다음에 시작하는 확인된 일정을 볼 수 있습니다.</p>}
      {feed.error && <p className="seo-note">일부 원문 갱신이 지연되어 마지막으로 확인한 자료를 표시합니다. 원문의 최신 안내를 확인하세요.</p>}
      <div className="seo-layout"><div>
        <section className="seo-card"><h2>시작·종료 시각</h2><dl className="seo-facts"><div><dt>시작</dt><dd><time dateTime={event.start.value}>{formatSourceTime(event.start)}</time></dd></div><div><dt>종료</dt><dd><time dateTime={event.end.value}>{formatSourceTime(event.end)}</time></dd></div><div><dt>시간 기준</dt><dd>{event.start.kind === "local" ? "각 도시 현지 시각" : "전 세계 공통 시각"}</dd></div></dl><p>{event.start.kind === "local" ? "같은 날짜·시각이라도 도시의 IANA 시간대와 서머타임에 따라 실제 시작 순간이 다릅니다. 한국시간으로 고정된 세계 공통 일정이 아닙니다." : "시간대가 포함된 원문 시각을 기준으로 모든 도시에서 같은 순간에 시작하고 종료합니다."}</p><div className="seo-scroll"><table className="seo-time-table"><caption className="seo-muted">도시별 시작·종료를 한국시간으로 비교</caption><thead><tr><th scope="col">도시·IANA 시간대</th><th scope="col">한국시간 시작</th><th scope="col">한국시간 종료</th></tr></thead><tbody>{comparisons.map(({ city, window }) => <tr key={city.id}><td><a href={`/cities/${city.id}`}>{city.name}</a><small>{city.zone}</small></td><td>{formatKst(window.start)}</td><td>{formatKst(window.end)}</td></tr>)}</tbody></table></div></section>
        <section className="seo-card"><h2>안내된 등장 포켓몬</h2>{event.pokemon.length ? <ul className="seo-pokemon-list">{event.pokemon.map(pokemon => <li key={`${pokemon.id}:${pokemon.form ?? pokemon.name}`}><PokemonArtwork pokemon={pokemon} className="seo-pokemon-art" /><span>{pokemon.nameKo || pokemon.name}</span></li>)}</ul> : <p>이 자료에 개별 등장 포켓몬 목록은 등록되어 있지 않습니다. 원문의 야생·레이드·맥스배틀 항목을 확인하세요.</p>}<p className="seo-muted">위 목록은 이벤트에서 안내한 포켓몬입니다. 모든 포켓몬이 야생에 나오거나 배틀 후 같은 폼으로 포획되는 것은 아닙니다. 티켓·리서치·포획 조건은 원문 안내를 따릅니다.</p></section>
      </div><aside>
        <section className="seo-card"><h2>자료 원문</h2><a className="seo-source" href={event.url} target="_blank" rel="noopener noreferrer">이벤트 공지 원문 보기 ↗</a><p>공식 공지와 공개 커뮤니티 자료에 기반합니다. 일정이나 참가 조건이 바뀌면 원문 안내가 우선합니다.</p><p className="seo-muted">피드 원문 조회 시각: <time dateTime={feed.fetchedAt}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(feed.fetchedAt))} KST</time></p></section>
        <section className="seo-card"><h2>다음에 시작하는 일정</h2>{upcoming.length ? <ul className="seo-links">{upcoming.map(item => <li key={item.event.id}><a href={eventPath(item.event.id)}>{item.event.nameKo}</a><small>{formatKst(item.window.start)} 시작 · 한국시간</small></li>)}</ul> : <p>새로 시작할 확인된 일정이 없습니다. 아직 발표되지 않은 날짜는 표시하지 않습니다.</p>}</section>
        <section className="seo-card"><h2>체육관 레이드는 따로 확인</h2><p>이벤트 시간만으로 특정 체육관에서 레이드가 열렸다고 판단하지 않습니다. 실제 공개 관측 자료는 별도 화면에서 확인하세요.</p><a className="seo-button" href="/live?city=seoul">서울 실시간 레이드</a></section>
      </aside></div>
    </main>
  </div>;
}
