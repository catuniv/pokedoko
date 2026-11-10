"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, MessageSquare, Send, X } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { feedbackVisitorId, initializeUsage, sendUsage, setUsageAllowed, syncUsagePreference, usageAllowed, usageViewForPath, type UsageDetail } from "@/lib/growth-client";
import "./growth.css";

export default function GrowthTools() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    initializeUsage();
    setAllowed(usageAllowed());
    setPrivacyBlocked(navigator.doNotTrack === "1" || !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
    const pageView = () => {
      const view = usageViewForPath(location.pathname);
      const value = new URLSearchParams(location.search).get("city") ?? (location.pathname.startsWith("/cities/") ? location.pathname.split("/")[2] : null);
      const city = CITIES.some(c => c.id === value) ? value! : undefined;
      if (view) void sendUsage({ event: "page_view", view, city });
    };
    const usage = (event: Event) => {
      const detail = (event as CustomEvent<UsageDetail>).detail;
      if (detail && typeof detail === "object") void sendUsage(detail);
    };
    const preference = () => setAllowed(usageAllowed());
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === "pokedoko.usage.enabled") { syncUsagePreference(); preference(); setPreferenceNotice(""); }
    };
    pageView();
    window.addEventListener("pokedoko:usage", usage);
    window.addEventListener("pokedoko:navigate", pageView);
    window.addEventListener("popstate", pageView);
    window.addEventListener("pokedoko:usage-preference", preference);
    window.addEventListener("storage", storage);
    return () => {
      alive.current = false;
      window.removeEventListener("pokedoko:usage", usage);
      window.removeEventListener("pokedoko:navigate", pageView);
      window.removeEventListener("popstate", pageView);
      window.removeEventListener("pokedoko:usage-preference", preference);
      window.removeEventListener("storage", storage);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const text = message.trim();
    if (Array.from(text).length < 20) { setError("상황을 확인할 수 있도록 20자 이상 적어주세요."); return; }
    const page = usageViewForPath(location.pathname) ?? "live";
    const value = new URLSearchParams(location.search).get("city") ?? (location.pathname.startsWith("/cities/") ? location.pathname.split("/")[2] : null);
    const city = CITIES.some(c => c.id === value) ? value : undefined;
    setSending(true); setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: feedbackVisitorId(), category, message: text, page, ...(city ? { city } : {}), website }),
        signal: controller.signal,
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error("제보가 많이 접수됐어요. 잠시 후 다시 보내주세요.");
        throw new Error("지금은 제보를 보내지 못했어요. 작성한 내용은 남겨두었으니 잠시 후 다시 시도해주세요.");
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) throw new Error("접수 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
      if (alive.current) { setSent(true); setMessage(""); }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "응답이 늦어지고 있어요. 작성한 내용은 남겨두었어요.");
    } finally { clearTimeout(timer); if (alive.current) setSending(false); }
  }

  return <LanguageScope>{<>
    <button className="growth-launcher" type="button" onClick={() => { setSent(false); setError(""); dialog.current?.showModal(); }}>
      <MessageSquare size={17} /> 의견 보내기
    </button>
    <dialog ref={dialog} className="growth-dialog" aria-labelledby="growth-title" onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="growth-dialog-header">
        <div><span className="growth-eyebrow">pokedoko</span><h2 id="growth-title">의견 보내기</h2></div>
        <button type="button" className="growth-close" aria-label="의견 창 닫기" onClick={() => dialog.current?.close()}><X size={20} /></button>
      </div>
      {sent ? <div className="growth-success" role="status"><CheckCircle2 size={32} /><strong>의견을 보내주셔서 고마워요.</strong><p>운영자가 확인하고 개선에 참고할게요.</p><button type="button" onClick={() => dialog.current?.close()}>닫기</button></div> : <form onSubmit={event => void submit(event)}>
        <p className="growth-intro">불편한 점이나 필요한 기능을 알려주세요. 로그인 없이 보낼 수 있어요.</p>
        <fieldset className="growth-categories" disabled={sending}><legend>어떤 의견인가요?</legend>{[{ value: "bug", label: "오류 제보" }, { value: "data", label: "정보 수정" }, { value: "suggestion", label: "기능 제안" }].map(option => <label key={option.value} data-selected={category === option.value}><input type="radio" name="category" value={option.value} checked={category === option.value} onChange={() => setCategory(option.value)} />{option.label}</label>)}</fieldset>
        <label className="growth-message-label" htmlFor="growth-message">내용</label>
        <textarea id="growth-message" minLength={20} maxLength={4000} disabled={sending} value={message} onChange={event => setMessage(Array.from(event.target.value).slice(0, 2000).join(""))} placeholder="예: 도쿄를 고른 뒤 보스 필터를 바꾸면 도시가 초기화돼요." required rows={5} />
        <div className="growth-message-hint"><span>이메일·전화번호 등 개인정보는 적지 말아주세요.</span><span>{Array.from(message).length.toLocaleString()}/2,000</span></div>
        <label className="growth-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={event => setWebsite(event.target.value)} /></label>
        {error && <p className="growth-error" role="alert">{error}</p>}
        <button type="submit" className="growth-submit" disabled={sending}><Send size={16} />{sending ? "보내는 중…" : "의견 보내기"}</button>
        <p className="growth-private-note">내용은 운영자만 확인하며 30일을 기준으로 정리해요.</p>
      </form>}
      <div className="growth-usage-settings">
        <label><span>익명 이용 통계</span><input type="checkbox" checked={allowed} disabled={privacyBlocked} onChange={event => {
          const saved = setUsageAllowed(event.target.checked);
          setAllowed(usageAllowed());
          setPreferenceNotice(saved ? "" : "브라우저가 설정 저장을 제한해 현재 탭에만 적용했어요.");
        }} /></label>
        {preferenceNotice && <p role="status">{preferenceNotice}</p>}
        {privacyBlocked && <p>브라우저의 추적 제한 설정에 따라 통계를 기록하지 않아요.</p>}
        <p>방문·공유·좌표 복사와 재방문을 집계해요. 이름·연락처·좌표·검색어는 통계로 보내지 않아요.</p>
        <a href="/privacy">기록과 보관 기간 안내</a>
      </div>
    </dialog>
  </>}</LanguageScope>;
}
