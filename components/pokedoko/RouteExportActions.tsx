"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Copy, Download, X } from "lucide-react";
import "./route-export.css";

type Props = {
  gpx: string;
  coordinates: string;
  filename: string;
  disabled?: boolean;
};
type CopyKind = "gpx" | "coordinates";
type Fallback = { kind: CopyKind; value: string };

export function safeGpxFilename(filename: string): string {
  const cleaned = filename.normalize("NFKC").trim().replace(/\.gpx$/i, "")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/^\.+/, "").replace(/[.\s]+$/, "");
  let base = Array.from(cleaned).slice(0, 140).join("");
  if (!/[\p{L}\p{N}]/u.test(base)) base = "pokedoko-route";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `pokedoko-${base}`;
  return `${base}.gpx`;
}

function ExportSession({ gpx, coordinates, filename, disabled = false }: Props) {
  const [pending, setPending] = useState<CopyKind | null>(null);
  const [fallback, setFallback] = useState<Fallback | null>(null);
  const [status, setStatus] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const copyTrigger = useRef<HTMLButtonElement | null>(null);
  const lifecycle = useRef({ active: true, request: 0, busy: false });
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const id = useId();
  const blocked = disabled || pending !== null;

  useEffect(() => {
    const current = lifecycle.current;
    const urls = downloadUrls.current;
    current.active = true;
    return () => {
      current.active = false;
      current.request++;
      current.busy = false;
      for (const [url, timer] of urls) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (fallback && textarea.current?.isConnected) {
      textarea.current.focus();
      textarea.current.select();
    }
  }, [fallback]);

  async function copy(kind: CopyKind, trigger: HTMLButtonElement) {
    // The ref also blocks two clicks in one event batch, before state rerenders.
    if (disabled || lifecycle.current.busy || !lifecycle.current.active) return;
    const value = kind === "gpx" ? gpx : coordinates;
    if (!value.trim()) return;
    lifecycle.current.busy = true;
    const request = ++lifecycle.current.request;
    const isCurrent = () => lifecycle.current.active && lifecycle.current.request === request;
    copyTrigger.current = trigger;
    setFallback(null);
    setPending(kind);
    setStatus(kind === "gpx" ? "GPX를 복사하는 중입니다." : "좌표 목록을 복사하는 중입니다.");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      if (isCurrent()) setStatus(kind === "gpx" ? "GPX를 복사했습니다." : "좌표 목록을 복사했습니다.");
    } catch {
      if (isCurrent()) {
        setFallback({ kind, value });
        setStatus("자동 복사를 사용할 수 없습니다. 아래 선택된 내용을 복사하세요.");
      }
    } finally {
      if (isCurrent()) {
        lifecycle.current.busy = false;
        setPending(null);
      }
    }
  }

  function closeFallback() {
    setFallback(null);
    setStatus("");
    const trigger = copyTrigger.current;
    if (trigger?.isConnected && !trigger.disabled) trigger.focus();
  }

  function download() {
    if (blocked || lifecycle.current.busy || !gpx.trim()) return;
    setFallback(null);
    setStatus("");
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const blob = new Blob([gpx], { type: "application/gpx+xml;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      const url = objectUrl;
      // Give the browser time to consume the download before revoking its URL.
      downloadUrls.current.set(url, setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 30_000));
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeGpxFilename(filename);
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      setStatus("GPX 파일 다운로드를 요청했습니다.");
    } catch {
      if (objectUrl) {
        const timer = downloadUrls.current.get(objectUrl);
        if (timer !== undefined) clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);
        downloadUrls.current.delete(objectUrl);
      }
      setStatus("파일 다운로드를 시작하지 못했습니다. GPX 복사를 사용해 주세요.");
    } finally {
      anchor?.remove();
    }
  }

  const fallbackLabel = fallback?.kind === "gpx" ? "복사할 GPX" : "복사할 좌표 목록";
  return <LanguageScope>{(
    <div className="route-export-actions" role="group" aria-label="경로 파일과 좌표 내보내기" aria-busy={pending !== null}>
      <div className="route-export-buttons">
        <button type="button" disabled={blocked || !gpx.trim()} onClick={event => void copy("gpx", event.currentTarget)}><Copy size={15} aria-hidden="true" />GPX 복사</button>
        <button type="button" disabled={blocked || !gpx.trim()} onClick={download}><Download size={15} aria-hidden="true" />GPX 다운로드</button>
        <button type="button" disabled={blocked || !coordinates.trim()} onClick={event => void copy("coordinates", event.currentTarget)}><Copy size={15} aria-hidden="true" />좌표 목록 복사</button>
      </div>
      <p className="route-export-status" role="status" aria-live="polite">{status}</p>
      {fallback && !disabled && (
        <div className="route-export-fallback" role="group" aria-labelledby={`${id}-label`} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeFallback(); }
        }}>
          <div className="route-export-fallback-heading">
            <label id={`${id}-label`} htmlFor={`${id}-text`}>{fallbackLabel}</label>
            <button type="button" onClick={closeFallback} aria-label="복사 입력란 닫기"><X size={16} aria-hidden="true" /></button>
          </div>
          <textarea ref={textarea} id={`${id}-text`} aria-label={fallbackLabel} readOnly autoFocus rows={fallback.kind === "gpx" ? 9 : 5} value={fallback.value} spellCheck={false} />
          <p>선택된 내용을 복사하세요. Esc 키나 닫기 버튼으로 돌아갈 수 있습니다.</p>
        </div>
      )}
    </div>
  )}</LanguageScope>;
}

export default function RouteExportActions(props: Props) {
  // A new payload/disabled state starts a fresh session, closing old fallbacks
  // and preventing late Clipboard completions from updating the new route UI.
  const session = useMemo(() => JSON.stringify([props.gpx, props.coordinates, props.filename, Boolean(props.disabled)]), [props.gpx, props.coordinates, props.filename, props.disabled]);
  return <LanguageScope>{<ExportSession key={session} {...props} />}</LanguageScope>;
}
