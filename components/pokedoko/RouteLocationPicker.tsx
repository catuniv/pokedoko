"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Crosshair, LoaderCircle, LocateFixed, MapPin, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { CITIES } from "@/lib/cities";
import type { CellPoint } from "@/lib/cell-routes";
import "./route-location-picker.css";

export type RoutePickerPlace = { id: string; name: string; point: CellPoint; sourceRouteId: string };
type Selection = "start" | "end";
type WorldPoint = { x: number; y: number };
type View = { center: WorldPoint; zoom: number };
type Gesture = { start: WorldPoint; center: WorldPoint; zoom: number; moved: boolean };
type Pinch = { distance: number; zoom: number; anchor: WorldPoint };
const TILE_SIZE = 256, HEIGHT = 330, MAX_LAT = 85.05112878;
const clampZoom = (zoom: number) => Math.max(3, Math.min(19, zoom));
function project(point: CellPoint): WorldPoint {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, point.lat)) * Math.PI / 180;
  return { x: (point.lon + 180) / 360 * TILE_SIZE, y: (.5 - Math.log((1 + Math.sin(lat)) / (1 - Math.sin(lat))) / (4 * Math.PI)) * TILE_SIZE };
}
function unproject(point: WorldPoint): CellPoint {
  const x = ((point.x % TILE_SIZE) + TILE_SIZE) % TILE_SIZE, y = Math.max(0, Math.min(TILE_SIZE, point.y));
  return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / TILE_SIZE))) * 180 / Math.PI, lon: x / TILE_SIZE * 360 - 180 };
}
function safeCenter(point: WorldPoint): WorldPoint {
  return { x: ((point.x % TILE_SIZE) + TILE_SIZE) % TILE_SIZE, y: Math.max(0, Math.min(TILE_SIZE, point.y)) };
}
function nearWorld(point: WorldPoint, center: WorldPoint): WorldPoint {
  let x = point.x;
  while (x - center.x > TILE_SIZE / 2) x -= TILE_SIZE;
  while (x - center.x < -TILE_SIZE / 2) x += TILE_SIZE;
  return { x, y: point.y };
}
const coordinate = (point?: CellPoint) => point ? `${point.lat},${point.lon}` : "미선택";

/** Edits endpoint markers only. This picker never generates or edits path geometry. */
export default function RouteLocationPicker({ cityId, start, end, points = [], geometryLabel, places, loading = false, error = "", truncated = false, disabled = false, selection, onSelectionChange, onPick, onRetry }: {
  cityId: string; start?: CellPoint; end?: CellPoint; points?: readonly CellPoint[]; geometryLabel?: string;
  places: readonly RoutePickerPlace[]; loading?: boolean; error?: string; truncated?: boolean; disabled?: boolean;
  selection: Selection; onSelectionChange: (value: Selection) => void;
  onPick: (target: Selection, point: CellPoint, name?: string) => void; onRetry?: () => void;
}) {
  const city = CITIES.find(item => item.id === cityId) ?? CITIES[0];
  const canvas = useRef<HTMLDivElement>(null), [width, setWidth] = useState(640);
  const [view, setView] = useState<View>(() => ({ center: project(city), zoom: 14 }));
  const viewRef = useRef(view), widthRef = useRef(width), pointers = useRef(new Map<number, WorldPoint>());
  const gesture = useRef<Gesture | null>(null), pinch = useRef<Pinch | null>(null);
  const [dragging, setDragging] = useState(false), [tileError, setTileError] = useState(false), [query, setQuery] = useState("");
  const previousPoints = useRef(points);
  widthRef.current = width;
  const targetLabel = selection === "start" ? "시작점" : "종료점";
  function updateView(next: View) { const value = { center: safeCenter(next.center), zoom: clampZoom(next.zoom) }; viewRef.current = value; setView(value); }
  useEffect(() => {
    updateView({ center: project(city), zoom: 14 });
    setQuery(""); setTileError(false); pointers.current.clear(); gesture.current = null; pinch.current = null; setDragging(false);
  // City changes reset the viewport without changing the submitted endpoints.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const measure = () => setWidth(Math.max(220, Math.floor(element.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  function fittedView(): View {
    const all = points.length > 1 ? [...points, ...(start ? [start] : []), ...(end ? [end] : [])] : [...(start ? [start] : []), ...(end ? [end] : [])];
    if (!all.length) return { center: project(city), zoom: 14 };
    const origin = project(all[0]), projected = all.map(point => nearWorld(project(point), origin));
    const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const zoom = Math.floor(Math.log2(Math.min((widthRef.current - 76) / Math.max(.00001, maxX - minX), (HEIGHT - 90) / Math.max(.00001, maxY - minY))));
    return { center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, zoom: Math.min(17, clampZoom(zoom)) };
  }
  useEffect(() => {
    if (previousPoints.current !== points && points.length > 1) { updateView(fittedView()); setTileError(false); }
    previousPoints.current = points;
  // Endpoint picking must not keep resetting a user's pan/zoom gesture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  const scale = 2 ** view.zoom, left = view.center.x * scale - width / 2, top = view.center.y * scale - HEIGHT / 2;
  function screen(point: CellPoint) { const value = nearWorld(project(point), view.center); return { x: value.x * scale - left, y: value.y * scale - top }; }
  function pointerPosition(event: { clientX: number; clientY: number }): WorldPoint {
    const bounds = canvas.current!.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function worldAt(position: WorldPoint, current = viewRef.current): WorldPoint {
    return { x: current.center.x + (position.x - widthRef.current / 2) / 2 ** current.zoom, y: current.center.y + (position.y - HEIGHT / 2) / 2 ** current.zoom };
  }
  function beginPinch() {
    const active = [...pointers.current.values()]; if (active.length < 2) return;
    const midpoint = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
    pinch.current = { distance: Math.max(1, Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)), zoom: viewRef.current.zoom, anchor: worldAt(midpoint) };
    if (gesture.current) gesture.current.moved = true;
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.pointerType === "mouse" && event.button !== 0 || (event.target as Element).closest("button,a,input")) return;
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    const position = pointerPosition(event); pointers.current.set(event.pointerId, position);
    if (pointers.current.size === 1) gesture.current = { start: position, center: { ...viewRef.current.center }, zoom: viewRef.current.zoom, moved: false };
    else beginPinch();
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !pointers.current.has(event.pointerId)) return;
    const position = pointerPosition(event); pointers.current.set(event.pointerId, position);
    const active = [...pointers.current.values()];
    if (active.length > 1 && pinch.current) {
      const current = pinch.current, distance = Math.max(1, Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y));
      const zoom = clampZoom(Math.round(current.zoom + Math.log2(distance / current.distance)));
      const midpoint = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
      updateView({ center: { x: current.anchor.x - (midpoint.x - widthRef.current / 2) / 2 ** zoom, y: current.anchor.y - (midpoint.y - HEIGHT / 2) / 2 ** zoom }, zoom });
      setDragging(true); return;
    }
    const current = gesture.current; if (!current) return;
    const dx = position.x - current.start.x, dy = position.y - current.start.y;
    if (Math.hypot(dx, dy) > 5) current.moved = true;
    if (current.moved) { updateView({ center: { x: current.center.x - dx / 2 ** current.zoom, y: current.center.y - dy / 2 ** current.zoom }, zoom: current.zoom }); setDragging(true); }
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (!pointers.current.has(event.pointerId)) return;
    const current = gesture.current, position = pointerPosition(event), wasPinching = !!pinch.current;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && !disabled && !wasPinching && current && !current.moved) onPick(selection, unproject(worldAt(position)));
    if (pointers.current.size === 1) {
      const remaining = [...pointers.current.values()][0]; gesture.current = { start: remaining, center: { ...viewRef.current.center }, zoom: viewRef.current.zoom, moved: true }; pinch.current = null;
    } else if (pointers.current.size > 1) beginPinch();
    else { gesture.current = null; pinch.current = null; setDragging(false); }
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || event.target !== event.currentTarget) return;
    const movement = ({ ArrowLeft: [-64, 0], ArrowRight: [64, 0], ArrowUp: [0, -64], ArrowDown: [0, 64] } as Record<string, readonly [number, number]>)[event.key];
    if (movement) { event.preventDefault(); const current = viewRef.current; updateView({ ...current, center: { x: current.center.x + movement[0] / 2 ** current.zoom, y: current.center.y + movement[1] / 2 ** current.zoom } }); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(selection, unproject(viewRef.current.center)); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); updateView({ ...viewRef.current, zoom: viewRef.current.zoom + 1 }); }
    else if (event.key === "-") { event.preventDefault(); updateView({ ...viewRef.current, zoom: viewRef.current.zoom - 1 }); }
  }
  const matchedPlaces = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(); return normalized ? places.filter(place => place.name.toLocaleLowerCase().includes(normalized)) : [...places];
  }, [places, query]);
  const tiles: { key: string; x: number; y: number; src: string }[] = [];
  for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + width - 1) / TILE_SIZE); x++) for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + HEIGHT - 1) / TILE_SIZE); y++) {
    if (y < 0 || y >= scale) continue;
    const wrappedX = ((x % scale) + scale) % scale;
    tiles.push({ key: `${view.zoom}/${x}/${y}`, x: x * TILE_SIZE - left, y: y * TILE_SIZE - top, src: `https://tile.openstreetmap.org/${view.zoom}/${wrappedX}/${y}.png` });
  }
  const startScreen = start ? screen(start) : undefined, endScreen = end ? screen(end) : undefined;
  const sameEndpoint = !!startScreen && !!endScreen && Math.hypot(startScreen.x - endScreen.x, startScreen.y - endScreen.y) < 18;
  function pickPlace(place: RoutePickerPlace) { onPick(selection, { ...place.point }, place.name); updateView({ center: project(place.point), zoom: Math.max(16, viewRef.current.zoom) }); }
  return <LanguageScope>{<section className="route-location-picker" aria-label="지도에서 루트 시작·종료 위치 선택">
    <div className="route-picker-heading"><div><strong>지도에서 위치 선택</strong><p>등록된 위치를 누르거나 지도를 눌러 {targetLabel}을 선택하세요.</p></div><MapPin size={21} aria-hidden="true" /></div>
    <div className="route-picker-selection" role="group" aria-label="지도에서 고를 위치"><button type="button" aria-pressed={selection === "start"} disabled={disabled} onClick={() => onSelectionChange("start")}><span className="route-picker-dot route-picker-dot-start" />시작점 선택{start && <Check size={14} />}</button><button type="button" aria-pressed={selection === "end"} disabled={disabled} onClick={() => onSelectionChange("end")}><span className="route-picker-dot route-picker-dot-end" />종료점 선택{end && <Check size={14} />}</button></div>
    <div className={`route-picker-canvas${dragging ? " is-dragging" : ""}`} ref={canvas} tabIndex={disabled ? -1 : 0} role="group" aria-label={`${city.name} 위치 선택 지도. 방향키로 이동하고 Enter로 ${targetLabel} 선택`} aria-disabled={disabled} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)} onPointerCancel={event => pointerEnd(event, true)} onKeyDown={keyboard}>
      <div className="route-picker-tiles" aria-hidden="true">{tiles.map(tile => <img key={tile.key} src={tile.src} width={TILE_SIZE} height={TILE_SIZE} alt="" draggable={false} decoding="async" referrerPolicy="strict-origin-when-cross-origin" style={{ left: tile.x, top: tile.y }} onError={() => setTileError(true)} />)}</div>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="route-picker-path" aria-hidden="true">{points.length > 1 && <><polyline className="route-picker-path-border" points={points.map(point => { const value = screen(point); return `${value.x},${value.y}`; }).join(" ")} /><polyline className="route-picker-path-line" points={points.map(point => { const value = screen(point); return `${value.x},${value.y}`; }).join(" ")} /></>}</svg>
      <div className="route-picker-marker-layer">{matchedPlaces.map(place => {
        const position = screen(place.point); if (position.x < -20 || position.x > width + 20 || position.y < -20 || position.y > HEIGHT + 20) return null;
        return <button type="button" key={place.id} className="route-picker-place-marker" disabled={disabled} style={{ left: position.x, top: position.y }} aria-label={`${place.name}을 ${targetLabel}으로 선택`} title={place.name} onClick={() => pickPlace(place)}><span>P</span></button>;
      })}</div>
      {startScreen && <span className={`route-picker-endpoint route-picker-start${sameEndpoint ? " route-picker-shared" : ""}`} style={{ left: startScreen.x, top: startScreen.y }} aria-hidden="true">{sameEndpoint ? "S·E" : "S"}</span>}
      {endScreen && !sameEndpoint && <span className="route-picker-endpoint route-picker-end" style={{ left: endScreen.x, top: endScreen.y }} aria-hidden="true">E</span>}
      <span className="route-picker-crosshair" aria-hidden="true"><Crosshair size={19} /></span>
      <div className="route-picker-controls" role="group" aria-label="선택 지도 확대·축소"><button type="button" disabled={disabled || view.zoom >= 19} aria-label="선택 지도 확대" onClick={() => updateView({ ...viewRef.current, zoom: viewRef.current.zoom + 1 })}><Plus size={18} /></button><button type="button" disabled={disabled || view.zoom <= 3} aria-label="선택 지도 축소" onClick={() => updateView({ ...viewRef.current, zoom: viewRef.current.zoom - 1 })}><Minus size={18} /></button><button type="button" disabled={disabled} aria-label="선택한 위치와 전체 경로에 지도 맞추기" onClick={() => updateView(fittedView())}><LocateFixed size={18} /></button></div>
      <a className="route-picker-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
    <div className="route-picker-map-footer"><span>드래그로 이동 · 두 손가락 또는 버튼으로 확대</span><button type="button" disabled={disabled} onClick={() => onPick(selection, unproject(viewRef.current.center))}><Crosshair size={13} />중앙을 {targetLabel}으로 선택</button></div>
    <dl className="route-picker-current"><div><dt><span className="route-picker-dot route-picker-dot-start" />시작 좌표</dt><dd>{coordinate(start)}</dd></div><div><dt><span className="route-picker-dot route-picker-dot-end" />종료 좌표</dt><dd>{coordinate(end)}</dd></div></dl>
    {points.length > 1 ? <p className="route-picker-geometry-note">{geometryLabel || "첨부한 전체 경로"} · GPX {points.length.toLocaleString()}개 좌표를 표시합니다. 지도 선택으로 원본 경로선은 바뀌지 않아요.</p> : <p className="route-picker-geometry-note">시작·종료 위치만 고릅니다. 두 점을 연결해 실제 게임 경로나 GPX를 만들지 않아요.</p>}
    {tileError && <p className="route-picker-warning" role="status">일부 지도 배경을 불러오지 못했어요. 좌표 직접 입력은 계속 사용할 수 있어요.</p>}
    <div className="route-picker-places"><div className="route-picker-places-heading"><strong>등록된 포켓스톱·위치</strong><span>{places.length.toLocaleString()}개{truncated ? " · 일부 표시" : ""}</span></div>
      <p>우리 공개 루트에서 확인된 시작·종료 위치예요. 다른 지도 사이트의 위치를 가져오지 않습니다.</p>
      {loading && <div className="route-picker-message" role="status"><LoaderCircle size={15} className="community-spin" />등록된 위치를 불러오고 있어요.</div>}
      {!loading && error && <div className="route-picker-warning" role="alert"><span>{error}</span>{onRetry && <button type="button" disabled={disabled} onClick={onRetry}><RefreshCw size={13} />다시 조회</button>}</div>}
      {!loading && !error && places.length === 0 && <p className="route-picker-message">아직 등록된 위치가 없어요. 지도에서 위치를 선택한 뒤 포켓스톱 이름을 직접 입력해 주세요.</p>}
      {places.length > 0 && <><label className="route-picker-search"><Search size={15} /><span className="route-picker-sr-only">등록된 포켓스톱 이름 검색</span><input type="search" value={query} disabled={disabled} maxLength={120} placeholder="포켓스톱·위치 이름 검색" onChange={event => setQuery(event.target.value)} /></label><div className="route-picker-place-list">{matchedPlaces.slice(0, 12).map(place => <button type="button" disabled={disabled} key={place.id} onClick={() => pickPlace(place)}><MapPin size={14} /><span>{place.name}</span><small>{targetLabel}으로 선택</small></button>)}{matchedPlaces.length === 0 && <p className="route-picker-message">검색한 이름이 없어요. 지도에서 위치를 직접 선택할 수 있어요.</p>}{matchedPlaces.length > 12 && <p className="route-picker-list-note">이름 검색으로 더 좁혀 주세요. 지도에는 검색 결과 위치를 함께 표시합니다.</p>}</div></>}
    </div>
  </section>}</LanguageScope>;
}
