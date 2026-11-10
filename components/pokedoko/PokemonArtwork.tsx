"use client";
import { LanguageScope } from "@/components/pokedoko/LanguageProvider";

import { useState } from "react";
import type { Pokemon } from "@/lib/pokedoko-types";
import { nextPokemonArtworkCandidate, pokemonArtworkCandidates, pokemonArtworkFallbackLabel } from "@/lib/pokemon-artwork";

type Props = {
  pokemon: Pick<Pokemon, "id" | "name" | "nameKo" | "form" | "image">;
  className?: string;
  loading?: "eager" | "lazy";
  /** Feed.shiny describes availability; only an explicit appearance changes the image. */
  appearance?: { shiny?: boolean };
};

function ArtworkImage({ pokemon, className, loading = "lazy", candidates }: Props & { candidates: string[] }) {
  const [source, setSource] = useState<string | null>(candidates[0] ?? null);
  const name = pokemon.nameKo || pokemon.name;
  if (!source) return <LanguageScope>{(
    <span className={className} role="img" aria-label={`${name} · ${pokemonArtworkFallbackLabel(pokemon)}`} data-artwork-state="unavailable">
      <span className="pokemon-artwork-placeholder-name">{name}</span>
      <small className="pokemon-artwork-placeholder-note">{pokemonArtworkFallbackLabel(pokemon)}</small>
    </span>
  )}</LanguageScope>;
  return <LanguageScope>{(
    <img
      className={className}
      src={source}
      alt={name}
      loading={loading}
      decoding="async"
      onError={() => setSource(current => current === source ? nextPokemonArtworkCandidate(candidates, source) : current)}
    />
  )}</LanguageScope>;
}

export function PokemonArtwork(props: Props) {
  const candidates = pokemonArtworkCandidates(props.pokemon, props.appearance);
  // A changed record resets failures without effects or render-time state updates.
  return <LanguageScope>{<ArtworkImage key={JSON.stringify([props.pokemon.id, props.pokemon.name, props.pokemon.form, candidates])} {...props} candidates={candidates} />}</LanguageScope>;
}
