export type EventKind =
  | "raid-hour"
  | "raid-day"
  | "community-day"
  | "spotlight"
  | "event"
  | "research";
export type EventTime = { value: string; kind: "local" | "instant" };
export type Pokemon = {
  id: number | null;
  name: string;
  nameKo: string;
  image: string;
  shiny: boolean;
  types: string[];
  form?: string;
};
export type GoEvent = {
  id: string;
  name: string;
  nameKo: string;
  kind: EventKind;
  start: EventTime;
  end: EventTime;
  image: string;
  url: string;
  pokemon: Pokemon[];
  summary: string;
};
export type RaidBoss = Pokemon & {
  tier: string;
  confirmedWindow: boolean;
  sourceUrl: string;
};
export type Feed = {
  events: GoEvent[];
  bosses: RaidBoss[];
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  cached: boolean;
  error: string | null;
};
export type Region = "asia" | "oceania" | "europe" | "america" | "africa";
export type City = {
  id: string;
  name: string;
  nameEn: string;
  country: string;
  countryCode: string;
  zone: string;
  region: Region;
  lat: number;
  lon: number;
  spots: { name: string; lat: number; lon: number }[];
};
export type CityWindow = {
  start: Date;
  end: Date;
  event: GoEvent;
  active: boolean;
};
export type GymObservation = {
  id: string;
  name: string;
  cityId: string;
  startsAt: string;
  endsAt: string | null;
  recordedAt: string;
  pokemonName: string;
};
