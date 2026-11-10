"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LocateFixed, Minus, Plus } from "lucide-react";
import type { CellPoint } from "@/lib/cell-routes";

const TILE_SIZE = 256;
const MAP_HEIGHT = 310;
const MAX_MERCATOR_LAT = 85.05112878;
function project(point: CellPoint) {
  const latitude = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, point.lat)) * Math.PI / 180;
  return { x: (point.lon + 180) / 360 * TILE_SIZE, y: (.5 - Math.log((1 + Math.sin(latitude)) / (1 - Math.sin(latitude))) / (4 * Math.PI)) * TILE_SIZE };
}

/** Normal interactive viewing only: tiles mount when the route's detail is opened. */
export default function RouteGeometryMap({ name, points = [], start, end, kindLabel }: {
  name: string;
  points?: readonly CellPoint[];
  start: CellPoint;
  end?: CellPoint;
  kindLabel: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [selectedZoom, setSelectedZoom] = useState<number | null>(null);
  const [tileError, setTileError] = useState(false);
  const identity = `${name}:${points.length}:${start.lat}:${start.lon}:${end?.lat}:${end?.lon}`;
  useEffect(() => { setSelectedZoom(null); setTileError(false); }, [identity]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setWidth(Math.max(220, Math.floor(element.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const base = useMemo(() => {
    const origin = project(start);
    const unwrap = (point: CellPoint) => {
      const result = project(point);
      while (result.x - origin.x > TILE_SIZE / 2) result.x -= TILE_SIZE;
      while (result.x - origin.x < -TILE_SIZE / 2) result.x += TILE_SIZE;
      return result;
    };
    const path = points.map(unwrap), first = unwrap(start), last = end ? unwrap(end) : undefined;
    const all = [...path, first, ...(last ? [last] : [])];
    const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
    return { path, first, last, minX, maxX, minY, maxY, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } };
  }, [points, start, end]);
  const fit = Math.floor(Math.log2(Math.min((width - 64) / Math.max(.00001, base.maxX - base.minX), (MAP_HEIGHT - 76) / Math.max(.00001, base.maxY - base.minY))));
  const fitZoom = Math.min(18, Math.max(2, fit));
  const zoom = selectedZoom ?? fitZoom, scale = 2 ** zoom;
  const left = base.center.x * scale - width / 2, top = base.center.y * scale - MAP_HEIGHT / 2;
  const screen = (point: { x: number; y: number }) => ({ x: point.x * scale - left, y: point.y * scale - top });
  const first = screen(base.first), last = base.last ? screen(base.last) : undefined;
  const sameMarker = !!last && Math.hypot(last.x - first.x, last.y - first.y) < 16;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + width - 1) / TILE_SIZE); x++) {
    for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + MAP_HEIGHT - 1) / TILE_SIZE); y++) {
      if (y < 0 || y >= scale) continue;
      const wrappedX = ((x % scale) + scale) % scale;
      tiles.push({ key: `${zoom}/${x}/${y}`, src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`, x: x * TILE_SIZE - left, y: y * TILE_SIZE - top });
    }
  }
  const mapUrl = `https://www.openstreetmap.org/?mlat=${start.lat}&mlon=${start.lon}#map=${zoom}/${start.lat}/${start.lon}`;
  return <figure className="community-geometry-map">
    <div className="community-map-canvas" ref={container} style={{ height: MAP_HEIGHT }} role="group" aria-label={`${name} 지도. ${points.length > 1 ? kindLabel + " 전체 좌표선" : "시작 위치와 확인된 종료 위치만 표시"}`}>
      <div className="community-map-tiles" aria-hidden="true">{tiles.map((tile) => <img key={tile.key} src={tile.src} alt="" width={TILE_SIZE} height={TILE_SIZE} decoding="async" referrerPolicy="strict-origin-when-cross-origin" draggable={false} onError={() => setTileError(true)} style={{ left: tile.x, top: tile.y }} />)}</div>
      <svg width={width} height={MAP_HEIGHT} viewBox={`0 0 ${width} ${MAP_HEIGHT}`} className="community-map-overlay" aria-hidden="true">
        {base.path.length > 1 && <><polyline className="community-map-path-outline" points={base.path.map((p) => { const value = screen(p); return `${value.x},${value.y}`; }).join(" ")} /><polyline className="community-map-path" points={base.path.map((p) => { const value = screen(p); return `${value.x},${value.y}`; }).join(" ")} /></>}
        <g transform={`translate(${first.x},${first.y})`}><circle r="13" className="community-map-start" /><text y="4">{sameMarker ? "S·E" : "S"}</text></g>
        {last && !sameMarker && <g transform={`translate(${last.x},${last.y})`}><circle r="13" className="community-map-end" /><text y="4">E</text></g>}
      </svg>
      <div className="community-map-controls" role="group" aria-label="지도 확대와 축소"><button type="button" onClick={() => setSelectedZoom(Math.min(18, zoom + 1))} disabled={zoom >= 18} aria-label="지도 확대"><Plus size={16} /></button><button type="button" onClick={() => setSelectedZoom(Math.max(2, zoom - 1))} disabled={zoom <= 2} aria-label="지도 축소"><Minus size={16} /></button><button type="button" onClick={() => setSelectedZoom(null)} aria-label="전체 경로에 지도 맞추기"><LocateFixed size={16} /></button></div>
      <a className="community-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
    <figcaption><span>S 시작 · E 종료 · {points.length > 1 ? kindLabel : "전체 경로 미확보"}</span><a href={mapUrl} target="_blank" rel="noreferrer">큰 지도 <ExternalLink size={12} /></a></figcaption>
    {tileError && <p className="community-map-error" role="status">일부 지도 배경을 불러오지 못했어요. 경로선과 좌표는 확인할 수 있어요.</p>}
  </figure>;
}
