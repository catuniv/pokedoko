"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2, X } from "lucide-react";
import { CITIES } from "@/lib/cities";
import { buildShareUrl, parseShareState, patchShareState, usageDetail, type ShareState, type ShareView } from "@/lib/share-state";
import { usageViewForPath } from "@/lib/growth-client";
import "./share.css";
const CITY_IDS = CITIES.map((city) => city.id);

export function emitUsage(event: "coordinate_copy" | "share", city?: string) {
  if (typeof window === "undefined") return;
  const detail = usageDetail(event, location.pathname, location.search, CITY_IDS, city, location.pathname === "/" ? undefined : usageViewForPath(location.pathname));
  if (detail) { try { window.dispatchEvent(new CustomEvent("pokedoko:usage", { detail })); } catch { /* Usage reporting never affects sharing or copying. */ } }
}

/** Restore before enabling writes; time ticks with unchanged state never touch history. */
export function useSharedUrlState(view: ShareView, state: ShareState, restore: (state: ShareState) => void) {
  const [ready, setReady] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const latest = useRef(state);
  latest.current = state;
  const serialized = JSON.stringify(state);
  const last = useRef<string | null>(null);
  const reading = useRef(false);
  useEffect(() => {
    const read = () => {
      reading.current = true;
      setRestoring(true);
      restoreRef.current(parseShareState(location.search, CITY_IDS));
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [view]);
  useEffect(() => {
    if (!ready) return;
    if (reading.current && !restoring) return;
    if (restoring) { last.current = serialized; reading.current = false; setRestoring(false); return; }
    if (last.current === serialized) return;
    last.current = serialized;
    const next = patchShareState(new URL(location.href), latest.current);
    if (next.href !== location.href) history.replaceState(history.state, "", next.href);
  }, [ready, restoring, serialized]);
}

export default function ShareButton({ view, city, state = {} }: { view: ShareView; city?: string; state?: ShareState }) {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "fallback">("idle");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (status === "fallback") { input.current?.focus(); input.current?.select(); } }, [status]);
  async function share() {
    if (timer.current) clearTimeout(timer.current);
    const url = buildShareUrl(location.href, view, { ...state, ...(city ? { city } : {}) }, CITY_IDS);
    setLink(url); setBusy(true);
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: "pokedoko · 포켓몬 GO 일정", url });
          setStatus("shared"); emitUsage("share", city); return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") { setStatus("idle"); return; }
        }
      }
      try { await navigator.clipboard.writeText(url); setStatus("copied"); emitUsage("share", city); }
      catch { setStatus("fallback"); }
    } finally {
      setBusy(false);
      timer.current = setTimeout(() => setStatus((current) => current === "fallback" ? current : "idle"), 3000);
    }
  }
  return <div className="page-share">
    <button ref={trigger} type="button" className="page-share-button" disabled={busy} onClick={() => void share()}>
      {status === "copied" || status === "shared" ? <Check size={15} /> : <Share2 size={15} />}
      {status === "copied" ? "링크 복사됨" : status === "shared" ? "공유 완료" : "현재 화면 공유"}
    </button>
    <span className="sr-only" role="status">{status === "copied" ? "현재 선택을 담은 링크를 복사했습니다." : status === "shared" ? "현재 화면을 공유했습니다." : status === "fallback" ? "자동 공유가 차단됐습니다. 선택된 링크를 복사하세요." : ""}</span>
    {status === "fallback" && <div className="page-share-fallback">
      <label><span>링크를 선택해 복사하세요</span><input ref={input} readOnly value={link} aria-label="현재 화면 공유 링크" onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.currentTarget.select()} /></label>
      <button type="button" aria-label="공유 링크 닫기" onClick={() => { setStatus("idle"); trigger.current?.focus(); }}><X size={16} /></button>
    </div>}
  </div>;
}
