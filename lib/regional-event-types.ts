export type RegionalText = { ko: string; en: string; "zh-CN": string; ja: string };
export type RegionalReward = {
  speciesId: number;
  name: string;
  costume: RegionalText | null;
  spriteUrl: string | null;
  background: { name: string; imageUrl: string | null; localPresetId?: string } | null;
  method: RegionalText;
  backgroundChance: "guaranteed" | "possible" | "unknown";
};
export type RegionalEvent = {
  id: string;
  group: string;
  title: RegionalText;
  countryCode: string;
  city: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    coordinateKind: "venue" | "reference";
    coordinateSourceUrl: string;
  };
  schedule: {
    startDate: string;
    endDate: string | null;
    timeZone: string;
    startInstant?: string;
    hours?: { start: string; end: string };
  };
  rewards: RegionalReward[];
  limitations: RegionalText[];
  sources: string[];
  checkedAt: string;
};
export type RegionalEventStatus = "ongoing" | "upcoming" | "ended";
