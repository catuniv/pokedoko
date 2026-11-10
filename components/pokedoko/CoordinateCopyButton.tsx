"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CoordinateCopyButton({
  lat,
  lon,
  name,
}: {
  lat: number;
  lon: number;
  name: string;
}) {
  // Preserve the source coordinates without rounding or adding whitespace.
  const coordinates = `${lat},${lon}`;
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [pending, setPending] = useState(false);
  const fallback = useRef<HTMLInputElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );
  useEffect(() => {
    if (status === "failed") {
      fallback.current?.focus();
      fallback.current?.select();
    }
  }, [status]);

  async function copy() {
    if (reset.current) clearTimeout(reset.current);
    setPending(true);
    try {
      await navigator.clipboard.writeText(coordinates);
      setStatus("copied");
      reset.current = setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="coordinate-copy">
      <button
        type="button"
        className="coordinate-copy-button"
        onClick={() => void copy()}
        disabled={pending}
        title={coordinates}
        aria-label={`${name} 좌표 복사`}
      >
        {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
        {status === "copied" ? "복사됨" : "좌표 복사"}
      </button>
      <span className="sr-only" role="status">
        {status === "copied"
          ? `${coordinates} 좌표를 복사했습니다.`
          : status === "failed"
            ? "자동 복사가 차단됐습니다. 선택된 좌표를 복사하세요."
            : ""}
      </span>
      {status === "failed" && (
        <label className="coordinate-copy-fallback">
          <span>자동 복사가 차단됐습니다. 좌표를 복사하세요.</span>
          <input
            ref={fallback}
            aria-label={`${name} 복사할 좌표`}
            readOnly
            value={coordinates}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
