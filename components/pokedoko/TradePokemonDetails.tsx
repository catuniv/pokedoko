"use client";

import { useId, useState } from "react";
import { Image as ImageIcon, MapPin, Sparkles } from "lucide-react";
import type { TradeBackground, TradePokemon } from "@/lib/trades";
import { TRADE_BACKGROUND_PRESETS, formatTradeBackground } from "@/lib/trade-backgrounds";
import { tradeSpeciesName } from "@/lib/trade-pokemon-search";

export const tradeBackgroundLabel = formatTradeBackground;

export function TradeBackgroundPicker({ label, value, onChange, wanted = false }: {
  label: string; value?: TradeBackground; onChange: (value?: TradeBackground) => void; wanted?: boolean;
}) {
  const id = useId();
  const [custom, setCustom] = useState(false);
  const named = value?.kind === "location" || value?.kind === "special";
  const presets = TRADE_BACKGROUND_PRESETS.filter(preset => preset.kind === value?.kind);
  const selected = presets.find(preset => preset.name === value?.name);
  const isCustom = custom || !!value?.name && !selected;
  function changeKind(kind: string) {
    setCustom(false);
    if (kind === "unspecified") { onChange(undefined); return; }
    if (kind === "none" || kind === "any") { onChange({ kind, name: "" }); return; }
    if (kind === "location" || kind === "special") onChange({ kind, name: "" });
  }
  return <div className="trade-background-picker">
    <label htmlFor={id}>{label}<small>선택</small></label>
    <select id={id} value={value?.kind ?? "unspecified"} onChange={event => changeKind(event.target.value)}>
      <option value="unspecified">배경 미지정</option><option value="none">배경 없음</option>
      {wanted && <option value="any">배경 종류 무관 · 배경 있는 포켓몬</option>}
      <option value="location">지역 배경 (Location)</option><option value="special">스페셜 배경 (Special)</option>
    </select>
    {named && <>
      <label htmlFor={`${id}-name`}>{label} 이름</label>
      <select id={`${id}-name`} required value={isCustom ? "custom" : selected?.id ?? ""} onChange={event => {
        if (event.target.value === "custom") { setCustom(true); onChange({ kind: value.kind, name: "" }); }
        else { const preset = presets.find(item => item.id === event.target.value); if (preset) { setCustom(false); onChange({ kind: preset.kind, name: preset.name }); } }
      }}>
        <option value="" disabled>배경을 선택해 주세요</option>
        {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        <option value="custom">다른 배경 이름 직접 입력</option>
      </select>
      {isCustom && <label htmlFor={`${id}-custom`}>{label} 이름 직접 입력<input id={`${id}-custom`} required maxLength={80} value={value.name} onChange={event => onChange({ kind: value.kind, name: event.target.value })} placeholder="게임에 표시된 배경·이벤트 이름" /></label>}
      {selected && !custom && <a className="trade-background-source" href={selected.sourceUrl} target="_blank" rel="noreferrer">배경 공식 안내 ↗</a>}
    </>}
    <p className="trade-field-note">포켓몬 상세 화면의 배경을 선택해요. 목록에 없으면 이름을 직접 입력할 수 있어요.</p>
  </div>;
}

/** Illustrations are species references, never fabricated game-background images. */
export function TradePokemonPreview({ pokemon, emptyLabel }: { pokemon?: TradePokemon; emptyLabel?: string }) {
  const [failedSource, setFailedSource] = useState("");
  const source = pokemon && !pokemon.form.trim() ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.shiny ? "shiny/" : ""}${pokemon.speciesId}.png` : "";
  return <div className={`trade-pokemon-preview trade-preview-${pokemon?.background?.kind ?? "unspecified"}`}>
    <div className="trade-pokemon-illustration" aria-hidden="true">
      {source && source !== failedSource ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(source)} /> : <ImageIcon size={32} />}
      {pokemon?.shiny && <Sparkles size={17} className="trade-shiny-mark" />}
    </div>
    <div className="trade-preview-text">
      <strong>{pokemon ? tradeSpeciesName(pokemon.speciesId) : emptyLabel ?? "포켓몬을 선택해 주세요"}</strong>
      {pokemon && <><span>#{pokemon.speciesId}{pokemon.shiny ? " · Shiny" : " · Normal"}</span>
        {pokemon.form && <small className="trade-form-badge">{pokemon.form}</small>}
        <small className="trade-background-badge">{pokemon.background?.kind === "location" ? <MapPin size={12} /> : <ImageIcon size={12} />}{tradeBackgroundLabel(pokemon.background)}</small>
      </>}
    </div>
  </div>;
}
