"use client";

import { useId, useState } from "react";
import { Image as ImageIcon, MapPin, Sparkles } from "lucide-react";
import type { TradeBackground, TradePokemon } from "@/lib/trades";
import { formatTradeBackground } from "@/lib/trade-backgrounds";
import { tradeBackgroundImage, tradeBackgroundImageStyle } from "@/lib/trade-background-image";
import { useTradeBackgroundCatalog } from "./TradeBackgroundCatalog";
import { LanguageScope, useLanguage } from "./LanguageProvider";
import { tradeSpeciesName } from "@/lib/trade-pokemon-search";
import { PokemonArtwork } from "./PokemonArtwork";

export const tradeBackgroundLabel = formatTradeBackground;

export function TradeBackgroundPicker({ label, value, onChange, wanted = false }: {
  label: string; value?: TradeBackground; onChange: (value?: TradeBackground) => void; wanted?: boolean;
}) {
  const id = useId();
  const { presets: catalogPresets, fetchedAt: catalogUpdatedAt } = useTradeBackgroundCatalog();
  const { language } = useLanguage();
  const [custom, setCustom] = useState(false);
  const named = value?.kind === "location" || value?.kind === "special";
  const presets = catalogPresets.filter(preset => preset.kind === value?.kind);
  const selected = presets.find(preset => preset.name === value?.name);
  const isCustom = custom || !!value?.name && !selected;
  function changeKind(kind: string) {
    setCustom(false);
    if (kind === "unspecified") { onChange(undefined); return; }
    if (kind === "none" || kind === "any") { onChange({ kind, name: "" }); return; }
    if (kind === "location" || kind === "special") onChange({ kind, name: "" });
  }
  return <LanguageScope><div className="trade-background-picker">
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
        {presets.map(preset => <option key={preset.id} value={preset.id}>{language === "ko" ? preset.label : preset.name}</option>)}
        <option value="custom">다른 배경 이름 직접 입력</option>
      </select>
      {isCustom && <label htmlFor={`${id}-custom`}>{label} 이름 직접 입력<input id={`${id}-custom`} required maxLength={80} value={value.name} onChange={event => onChange({ kind: value.kind, name: event.target.value })} placeholder="게임에 표시된 배경·이벤트 이름" /></label>}
      {value.name.trim() && <TradeBackgroundThumbnail key={`${value.kind}:${value.name}:${catalogUpdatedAt ?? ""}`} background={value} />}
      {selected && !custom && <a className="trade-background-source" href={selected.sourceUrl} target="_blank" rel="noreferrer">배경 자료 출처 ↗</a>}
    </>}
    <p className="trade-field-note">포켓몬 상세 화면의 배경을 선택해요. 목록에 없으면 이름을 직접 입력할 수 있어요.</p>
  </div></LanguageScope>;
}

function TradeBackgroundThumbnail({ background }: { background: TradeBackground }) {
  const { presets } = useTradeBackgroundCatalog();
  const image = tradeBackgroundImage(background, presets), [failed, setFailed] = useState(false);
  if (!image || failed) return <LanguageScope><p className="trade-background-unavailable" role="status"><ImageIcon size={15} />{failed ? "배경 이미지를 불러오지 못했어요." : "이 배경의 이미지는 아직 없어요."}</p></LanguageScope>;
  return <LanguageScope><figure className="trade-background-thumbnail"><div className="trade-background-thumb-image"><img src={image.src} style={tradeBackgroundImageStyle(image)} alt={`${image.label} 배경`} width={84} height={84} loading="lazy" decoding="async" onError={() => setFailed(true)} /></div><figcaption><strong>선택한 배경</strong><span>{image.label}</span></figcaption></figure></LanguageScope>;
}

/** Original background art sits behind the transparent Pokémon GO game sprite. */
export function TradePokemonPreview({ pokemon, emptyLabel, background: selectedBackground }: { pokemon?: TradePokemon; emptyLabel?: string; background?: TradeBackground }) {
  const [failedBackground, setFailedBackground] = useState("");
  const background = selectedBackground ?? pokemon?.background;
  const { presets, fetchedAt } = useTradeBackgroundCatalog();
  const image = tradeBackgroundImage(background, presets);
  const backgroundAttempt = image ? `${image.src}:${fetchedAt ?? ""}` : "";
  const named = background?.kind === "location" || background?.kind === "special";
  const hasImage = !!image && failedBackground !== backgroundAttempt;
  return <LanguageScope><div className={`trade-pokemon-preview trade-preview-${background?.kind ?? "unspecified"}`} data-background-image={hasImage ? image.presetId : "none"}>
    <div className={`trade-pokemon-stage${hasImage ? " has-background" : ""}`}>
      {hasImage && <img className="trade-pokemon-background" src={image.src} style={tradeBackgroundImageStyle(image)} alt={`${image.label} 배경`} width={512} height={512} loading="lazy" decoding="async" onError={() => setFailedBackground(backgroundAttempt)} />}
      <div className="trade-pokemon-illustration" aria-hidden="true">
        {pokemon ? <PokemonArtwork pokemon={{ id: pokemon.speciesId, name: tradeSpeciesName(pokemon.speciesId), nameKo: "", form: pokemon.form, image: "" }} appearance={{ shiny: pokemon.shiny }} className="trade-game-sprite" /> : <ImageIcon size={32} />}
        {pokemon?.shiny && <Sparkles size={19} className="trade-shiny-mark" />}
      </div>
      {named && !!background.name.trim() && !hasImage && <span className="trade-stage-note">{image ? "배경 이미지 로딩 실패" : "배경 이미지 미등록"}</span>}
    </div>
    <div className="trade-preview-text">
      <strong>{pokemon ? tradeSpeciesName(pokemon.speciesId) : emptyLabel ?? "포켓몬을 선택해 주세요"}</strong>
      {pokemon && <><span>#{pokemon.speciesId}{pokemon.shiny ? " · Shiny" : " · Normal"}</span>{pokemon.form && <small className="trade-form-badge">{pokemon.form}</small>}</>}
      {(pokemon || background) && <small className="trade-background-badge">{background?.kind === "location" ? <MapPin size={12} /> : <ImageIcon size={12} />}{tradeBackgroundLabel(background)}</small>}
    </div>
  </div></LanguageScope>;
}
