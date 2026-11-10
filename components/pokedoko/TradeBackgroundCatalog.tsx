"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fallbackTradeBackgroundCatalog, mergeTradeBackgroundPresets, readTradeBackgroundCatalog, type TradeBackgroundCatalog } from "@/lib/trade-background-catalog";

const initial = fallbackTradeBackgroundCatalog();
const CatalogContext = createContext<TradeBackgroundCatalog>({ ...initial, error: undefined });

export function TradeBackgroundCatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<TradeBackgroundCatalog>({ ...initial, error: undefined });
  useEffect(() => {
    let active = true, pending = false, lastAttempt = -Infinity;
    let activeController: AbortController | null = null;
    async function refresh() {
      if (!active || pending || Date.now() - lastAttempt < 30 * 60_000) return;
      pending = true; lastAttempt = Date.now();
      const controller = new AbortController(); activeController = controller;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch("/api/trade-backgrounds", { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error();
        const next = readTradeBackgroundCatalog(await response.json());
        if (!next) throw new Error();
        if (active) setCatalog(previous => next.stale && previous.fetchedAt && (!next.fetchedAt || next.fetchedAt < previous.fetchedAt)
          ? { ...previous, stale: true, error: next.error ?? "배경 목록을 갱신하지 못했어요." }
          : { ...next, presets: mergeTradeBackgroundPresets(next.presets) });
      } catch {
        if (active) setCatalog(previous => ({ ...previous, stale: true, error: "배경 목록을 갱신하지 못해 마지막 확인 목록을 표시해요." }));
      } finally { clearTimeout(timeout); activeController = null; pending = false; }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 30 * 60_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; activeController?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return <LanguageScope>{<CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>}</LanguageScope>;
}

export function useTradeBackgroundCatalog() { return useContext(CatalogContext); }
