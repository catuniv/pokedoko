import type { Pokemon } from "./pokedoko-types";

export type ArtworkPokemon = Pick<Pokemon, "id" | "name" | "form" | "image">;
const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const LOCAL_SPECIES = new Set([35, 120, 605, 624, 643, 644, 744, 810, 813, 816]);
// These IDs were verified against PokeAPI's named-form responses, not guessed
// from the National Pokédex number. Sources are recorded in docs/pokemon-artwork.md.
const FORM_IDS: Record<string, number> = {
  "36:mega": 10278,
  "646:white": 10023,
  "646:black": 10022,
  "890:eternamax": 10190,
};

function formOf(pokemon: ArtworkPokemon): string {
  const explicit = pokemon.form?.trim().toLowerCase();
  if (explicit && explicit !== "normal") return explicit;
  // Some community records describe the form only in their English name.
  const name = pokemon.name.toLowerCase().replace(/[-_]/g, " ");
  if (/\bwhite kyurem\b|\bkyurem\s*\(white\)/.test(name)) return "white";
  if (/\bblack kyurem\b|\bkyurem\s*\(black\)/.test(name)) return "black";
  if (/\beternamax\b/.test(name)) return "eternamax";
  if (/\bmega\b/.test(name)) return "mega";
  if (/\b(alolan|galarian|hisuian|paldean|primal|crowned|origin|gigantamax|dynamax)\b/.test(name)) return "unregistered";
  // Community feeds also use names such as Deoxys (Attack) without form metadata.
  // If the original image fails, never substitute a normal form for that record.
  if (/\((?!normal\s*\))[^)]+\)/.test(name)) return "unregistered";
  return "normal";
}

function validImage(value: string): string | null {
  const image = value.trim();
  if (image.startsWith("/") && !image.startsWith("//")) return image;
  try {
    const url = new URL(image);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function isBaseSpeciesImage(image: string, id: number | null): boolean {
  if (id === null) return false;
  return new RegExp(`(?:/|pokemon_icon_0*)${id}(?:\\.(?:png|webp|gif|jpe?g)|_00(?:\\.|_))`, "i").test(image);
}

/** Exact form assets never fall back to an ordinary species illustration. */
export function pokemonArtworkCandidates(pokemon: ArtworkPokemon): string[] {
  const form = formOf(pokemon);
  const formId = FORM_IDS[`${pokemon.id}:${form}`];
  const candidates: string[] = [];
  const original = validImage(pokemon.image ?? "");
  if (original && (form === "normal" || !isBaseSpeciesImage(original, pokemon.id))) candidates.push(original);

  if (formId) {
    candidates.push(`/pokemon/${formId}.png`, `${SPRITES}/other/official-artwork/${formId}.png`, `${SPRITES}/other/home/${formId}.png`);
  } else if (form === "normal" && Number.isSafeInteger(pokemon.id) && pokemon.id! > 0 && pokemon.id! <= 100_000) {
    if (LOCAL_SPECIES.has(pokemon.id!)) candidates.push(`/pokemon/${pokemon.id}.png`);
    candidates.push(`${SPRITES}/other/official-artwork/${pokemon.id}.png`, `${SPRITES}/other/home/${pokemon.id}.png`, `${SPRITES}/${pokemon.id}.png`);
  }
  return [...new Set(candidates)];
}

export function nextPokemonArtworkCandidate(candidates: readonly string[], failed: string): string | null {
  const index = candidates.indexOf(failed);
  return index < 0 ? null : candidates[index + 1] ?? null;
}

export function pokemonArtworkFallbackLabel(pokemon: ArtworkPokemon): string {
  return formOf(pokemon) === "normal" ? "이미지 미등록" : "폼 이미지 미등록";
}
