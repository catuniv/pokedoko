import { TRADE_BACKGROUND_PRESETS } from "./trade-backgrounds";
import manifest from "./trade-background-image-manifest.json";
import { validTradeBackgroundImageUrl, type TradeBackgroundPreset } from "./trade-background-catalog";
import type { TradeBackground } from "./trades";

type ImageCrop = { x: number; y: number; size: number; sourceWidth: number; sourceHeight: number };
export type TradeBackgroundImage = { presetId: string; src: string; label: string; originalUrl: string; objectPosition: "center" | "right center"; crop?: ImageCrop };
type ImageRecord = { presetId: string; file: string; originalUrl: string; objectPosition?: string; crop?: ImageCrop };
const images = new Map((manifest as ImageRecord[]).map(image => [image.presetId, image]));
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

/** Match an identified background; never guess an image from the species or a city alone. */
export function tradeBackgroundImage(background?: TradeBackground, presets: readonly TradeBackgroundPreset[] = TRADE_BACKGROUND_PRESETS): TradeBackgroundImage | undefined {
  if (!background || background.kind !== "location" && background.kind !== "special" || !background.name.trim()) return undefined;
  const name = normalize(background.name);
  const preset = presets.find(item => item.kind === background.kind && (normalize(item.name) === name || normalize(item.label) === name));
  if (!preset) return undefined;
  const image = images.get(preset.id);
  if (image) return { presetId: preset.id, src: `/trade-backgrounds/${image.file}`, label: preset.name, originalUrl: image.originalUrl, objectPosition: image.objectPosition === "right center" ? "right center" : "center", ...(image.crop ? { crop: image.crop } : {}) };
  return validTradeBackgroundImageUrl(preset.imageUrl) ? { presetId: preset.id, src: preset.imageUrl, label: preset.name, originalUrl: preset.imageUrl, objectPosition: "center" } : undefined;
}

/** Crop only the bare background panel of the published 2026 reference, leaving source bytes intact. */
export function tradeBackgroundImageStyle(image: TradeBackgroundImage) {
  const crop = image.crop;
  return crop ? { width: `${crop.sourceWidth / crop.size * 100}%`, height: `${crop.sourceHeight / crop.size * 100}%`, left: `${-crop.x / crop.size * 100}%`, top: `${-crop.y / crop.size * 100}%`, right: "auto", bottom: "auto", objectFit: "fill" as const }
    : { objectPosition: image.objectPosition };
}
