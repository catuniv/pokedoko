import names from "./pokemon-names.json";
import localizedNames from "./pokemon-localized-names.json";

export type TradeSpecies = { id: number; ko: string; en: string };
const SPECIES: TradeSpecies[] = Object.entries(names).map(([id, name]) => ({ id: Number(id), ...name }));
const LOCALIZED = localizedNames as Record<string, { ja?: string; "zh-CN"?: string; aliases: string[] }>;
const BY_ID = new Map(SPECIES.map(species => [species.id, species]));
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s/g, "");

/** Search both languages; the display name stays English regardless of the query. */
export function searchTradeSpecies(query: string, limit = 12): TradeSpecies[] {
  const text = normalize(query.trim().replace(/^#/, ""));
  return SPECIES.filter(species => !text || normalize(species.ko).includes(text) || normalize(species.en).includes(text) || (LOCALIZED[String(species.id)]?.aliases ?? []).some(alias => normalize(alias).includes(text)) || String(species.id).startsWith(text))
    .slice(0, Math.max(0, Math.min(50, limit)));
}

export function tradeSpecies(speciesId: number): TradeSpecies | undefined { return BY_ID.get(speciesId); }
export function tradeSpeciesName(speciesId: number): string { return BY_ID.get(speciesId)?.en ?? `#${speciesId}`; }

export function tradeSpeciesLocalizedName(speciesId: number, language: string): string {
  if (language === "ja" || language === "zh-CN") return LOCALIZED[String(speciesId)]?.[language] ?? tradeSpeciesName(speciesId);
  return language === "ko" ? BY_ID.get(speciesId)?.ko ?? tradeSpeciesName(speciesId) : tradeSpeciesName(speciesId);
}
