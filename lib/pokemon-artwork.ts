import type { Pokemon } from "./pokedoko-types";
import catalog from "./pokemon-go-sprites.json";
import localImages from "./pokemon-go-local.json";

export type ArtworkPokemon = Pick<Pokemon, "id" | "name" | "form" | "image">;
export type PokemonAppearance = { shiny?: boolean };

type Sprite = { path: string; species: number; token: string; shiny: boolean; identity: string; variant: boolean };
type Pair = { normal?: Sprite; shiny?: Sprite };
const files = new Set<string>(catalog.files);
const byPath = new Map<string, Sprite>();
const byBasename = new Map<string, Sprite>();
const variants = new Map<string, Pair>();
const normal = new Map<number, Pair>();
const local: Record<string, string> = localImages;
const legacyForms: Record<string, string> = catalog.legacyForms;
const defaultForms: Record<string, string> = catalog.defaultForms;
const keyOf = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Every filename comes from the complete, commit-pinned PokeMiners Git tree.
// Filename construction below only selects entries already present in that tree.
for (const path of files) {
  const filename = path.split("/").at(-1)!;
  const addressable = /^pm(\d+)(?:\.([fc])([^.]+))?(?:\.g(\d+))?(\.s)?\.icon\.png$/.exec(filename);
  const legacy = /^pokemon_icon_(\d+)_([\d_]+?)(_shiny)?\.png$/.exec(filename);
  if (!addressable && !legacy) continue;
  const species = Number((addressable ?? legacy)![1]);
  const shiny = Boolean(addressable?.[5] || legacy?.[3]);
  const token = addressable ? addressable[3] ?? "NORMAL" : legacyForms[`${species}:${legacy![2]}`] ?? (legacy![2] === "00" ? "NORMAL" : `legacy-${legacy![2]}`);
  const identity = addressable ? path.replace(/\.s\.icon\.png$/, ".icon.png") : path.replace(/_shiny\.png$/, ".png");
  const variant = addressable ? Boolean(addressable[3] || addressable[4]) : legacy![2] !== "00";
  const sprite = { path, species, token, shiny, identity, variant };
  byPath.set(path, sprite);
  byBasename.set(filename, sprite);
  // Gender-specific images stay available through their exact source filename.
  // They must not silently replace a gender-unspecified species or form.
  if (addressable?.[4]) continue;
  const key = `${species}:${keyOf(token)}`;
  const pair = variants.get(key) ?? {};
  if (addressable || !pair[shiny ? "shiny" : "normal"]) pair[shiny ? "shiny" : "normal"] = sprite;
  variants.set(key, pair);
  if (token === "NORMAL") {
    const base = normal.get(species) ?? {};
    if (addressable || !base[shiny ? "shiny" : "normal"]) base[shiny ? "shiny" : "normal"] = sprite;
    normal.set(species, base);
  }
}

const ALIASES: Record<string, string> = {
  alola: "ALOLA", alolan: "ALOLA", 알로라: "ALOLA", アローラ: "ALOLA", 阿罗拉: "ALOLA",
  galar: "GALARIAN", galarian: "GALARIAN", 가라르: "GALARIAN", ガラル: "GALARIAN", 伽勒尔: "GALARIAN",
  hisui: "HISUIAN", hisuian: "HISUIAN", 히스이: "HISUIAN", ヒスイ: "HISUIAN", 洗翠: "HISUIAN",
  paldea: "PALDEA", paldean: "PALDEA", 팔데아: "PALDEA", パルデア: "PALDEA", 帕底亚: "PALDEA",
  mega: "MEGA", 메가: "MEGA", メガ: "MEGA", megax: "MEGA_X", megay: "MEGA_Y", 메가x: "MEGA_X", 메가y: "MEGA_Y",
  white: "WHITE", 화이트: "WHITE", ホワイト: "WHITE", black: "BLACK", 블랙: "BLACK", ブラック: "BLACK",
  crownedsword: "CROWNED_SWORD", 검왕: "CROWNED_SWORD", crownedshield: "CROWNED_SHIELD", 방패왕: "CROWNED_SHIELD",
  heroofmanybattles: "HERO", hero: "HERO", 역전의용사: "HERO",
  eternamax: "ETERNAMAX", 무한다이맥스: "ETERNAMAX", ムゲンダイマックス: "ETERNAMAX",
  gmax: "GIGANTAMAX", gigantamax: "GIGANTAMAX", 거다이맥스: "GIGANTAMAX", キョダイマックス: "GIGANTAMAX",
  attack: "ATTACK", attackforme: "ATTACK", 어택: "ATTACK", defense: "DEFENSE", defence: "DEFENSE", defenseforme: "DEFENSE", 디펜스: "DEFENSE", speed: "SPEED", speedforme: "SPEED", 스피드: "SPEED",
  altered: "ALTERED", alteredforme: "ALTERED", 어나더: "ALTERED", origin: "ORIGIN", originforme: "ORIGIN", 오리진: "ORIGIN",
  incarnate: "INCARNATE", incarnateforme: "INCARNATE", 화신: "INCARNATE", therian: "THERIAN", therianforme: "THERIAN", 영물: "THERIAN",
  primal: "PRIMAL", 원시: "PRIMAL", normal: "NORMAL", normalforme: "NORMAL", 일반: "NORMAL", 노말: "NORMAL", 노멀: "NORMAL",
};

function tokenOf(value: string): string {
  const key = keyOf(value);
  return ALIASES[key] ?? value.replace(/^(?:f|c)(?=[A-Z_])/, "");
}

function formOf(pokemon: ArtworkPokemon): string {
  const explicit = pokemon.form?.trim();
  if (explicit) return tokenOf(explicit);
  const name = pokemon.name.replace(/^Shadow\s+/i, "");
  if (/\bwhite\s+kyurem\b|화이트큐레무/i.test(name)) return "WHITE";
  if (/\bblack\s+kyurem\b|블랙큐레무/i.test(name)) return "BLACK";
  if (/\beternamax\b|무한다이맥스/i.test(name)) return "ETERNAMAX";
  if (/\bmega\b|^메가|^メガ/i.test(name)) return /(?:\b|[가-힣])x\b/i.test(name) ? "MEGA_X" : /(?:\b|[가-힣])y\b/i.test(name) ? "MEGA_Y" : "MEGA";
  for (const [pattern, token] of [
    [/\balolan?\b|알로라|アローラ/i, "ALOLA"], [/\bgalar(?:ian)?\b|가라르|ガラル/i, "GALARIAN"],
    [/\bhisui(?:an)?\b|히스이|ヒスイ/i, "HISUIAN"], [/\bpaldea(?:n)?\b|팔데아|パルデア/i, "PALDEA"],
    [/\bgigantamax\b|거다이맥스|キョダイマックス/i, "GIGANTAMAX"], [/\bcrowned\s+sword\b|검왕/i, "CROWNED_SWORD"],
    [/\bcrowned\s+shield\b|방패왕/i, "CROWNED_SHIELD"], [/\bprimal\b|^원시/i, "PRIMAL"],
  ] as const) if (pattern.test(name)) return token;
  const parenthetical = /\(([^)]+)\)/.exec(name);
  if (parenthetical) return tokenOf(parenthetical[1]);
  // Unlabelled costume text must not silently become a base species picture.
  if (/\b(hat|costume|crown|scarf|cap|jacket|poncho|balloon|origin|therian|incarnate)\b/i.test(name)) return "unregistered";
  return "NORMAL";
}

function sourceSprite(image: string): Sprite | undefined {
  if (!image.trim()) return undefined;
  try {
    const path = new URL(image, "https://pokedoko.invalid").pathname;
    const localPath = Object.keys(local).find(key => local[key] === path);
    return localPath ? byPath.get(localPath) : byBasename.get(decodeURIComponent(path.split("/").at(-1) ?? ""));
  } catch { return undefined; }
}

function counterpart(sprite: Sprite, shiny: boolean): Sprite | undefined {
  if (sprite.shiny === shiny) return sprite;
  const path = sprite.path.includes("Addressable Assets/")
    ? sprite.identity.replace(/\.icon\.png$/, shiny ? ".s.icon.png" : ".icon.png")
    : sprite.identity.replace(/\.png$/, shiny ? "_shiny.png" : ".png");
  return byPath.get(path);
}

function compatible(sprite: Sprite, token: string, species: number, explicit: boolean): boolean {
  if (sprite.species !== species) return false;
  if (token === "NORMAL" && !explicit) return true;
  if (keyOf(sprite.token) === keyOf(token)) return true;
  // A precise original costume/gender icon can carry a human-readable label
  // that does not itself correspond to a published game form token.
  if (!explicit && !variants.has(`${species}:${keyOf(token)}`) && sprite.variant) return true;
  return token === "NORMAL" && keyOf(sprite.token) === keyOf(defaultForms[String(species)] ?? "");
}

/** Actual GO sprite candidates only; an unavailable form never uses base artwork. */
export function pokemonArtworkCandidates(pokemon: ArtworkPokemon, appearance: PokemonAppearance = {}): string[] {
  const original = sourceSprite(pokemon.image ?? "");
  const species = pokemon.id ?? original?.species;
  if (!Number.isSafeInteger(species) || species! < 1 || species! > 1025) return [];
  const token = formOf(pokemon);
  const base = normal.get(species!);
  const defaultPair = variants.get(`${species}:${keyOf(defaultForms[String(species)] ?? "")}`);
  const pair = token === "NORMAL"
    ? base || defaultPair ? { ...defaultPair, ...base } : undefined
    : variants.get(`${species}:${keyOf(token)}`);
  // A free-text form that is not in the original asset catalog stays unregistered.
  const preciseOriginal = original && compatible(original, token, species!, !!pokemon.form?.trim());
  if (!pair && token !== "NORMAL" && !preciseOriginal) return [];
  const shiny = appearance.shiny ?? original?.shiny ?? false;
  const selected = original && preciseOriginal
    ? counterpart(original, shiny)
    : pair?.[shiny ? "shiny" : "normal"];
  if (!selected) return [];
  const candidates = [local[selected.path], catalog.baseUrl + selected.path.split("/").map(encodeURIComponent).join("/")];
  return [...new Set(candidates.filter((value): value is string => !!value))];
}

export function nextPokemonArtworkCandidate(candidates: readonly string[], failed: string): string | null {
  const index = candidates.indexOf(failed);
  return index < 0 ? null : candidates[index + 1] ?? null;
}

export function pokemonArtworkFallbackLabel(pokemon: ArtworkPokemon): string {
  return formOf(pokemon) === "NORMAL" ? "이미지 미등록" : "폼 이미지 미등록";
}
