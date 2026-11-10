import { CITIES } from "./cities";
import POKEMON_NAMES from "./pokemon-names.json";

export type TradePokemon = { speciesId: number; shiny: boolean; form: string };
export type TradePostStatus = "pending" | "approved" | "closed" | "removed" | "rejected" | "expired";
export type TradeContactKind = "friend_code" | "discord" | "kakao";
export type TradePostSummary = {
  id: string; cityId: string; mode: "local" | "remote"; offer: TradePokemon; want: TradePokemon;
  trainerName: string; notes: string; status: TradePostStatus; createdAt: string; expiresAt: string;
};
export type TradePostDetail = TradePostSummary & { contactKind: TradeContactKind; contactValue: string };
export type TradeSubmission = {
  visitorId: string; ownerKey: string; trainerName: string; cityId: string; mode: "local" | "remote";
  offer: TradePokemon; want: TradePokemon; contactKind: TradeContactKind; contactValue: string;
  contactPublicConsent: true; notes: string; expiresInDays: 1 | 3 | 7; website?: string;
};
export const TRADE_HELP_URL = "https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/1143-trading-pokemon/";
export const REMOTE_TRADE_HELP_URL = "https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/861-trading-remotely/";
export const TRADE_MAX_BODY_BYTES = 12 * 1024;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export const validTradeOwnerKey = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{64}$/i.test(value);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export class TradeValidationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "TradeValidationError"; }
}
const invalid = (code: string, message: string): never => { throw new TradeValidationError(code, message); };
function clean(value: unknown, label: string, max: number, optional = false, multiline = false): string {
  if (optional && value === undefined) return "";
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (typeof value !== "string" || controls.test(value) || Array.from(value.trim()).length > max || !optional && !value.trim()) return invalid("invalid_text", `${label}을 확인해 주세요.`);
  return value.trim();
}
function pokemon(value: unknown): TradePokemon {
  if (!object(value) || Object.keys(value).some(k => !["speciesId", "shiny", "form"].includes(k)) || typeof value.speciesId !== "number" || !Number.isSafeInteger(value.speciesId) || !Object.hasOwn(POKEMON_NAMES, String(value.speciesId)) || typeof value.shiny !== "boolean") return invalid("invalid_pokemon", "도감 목록에서 포켓몬을 선택해 주세요.");
  return { speciesId: value.speciesId, shiny: value.shiny, form: clean(value.form, "모습 설명", 50, true) };
}
export function tradePokemonName(speciesId: number): string {
  const names = POKEMON_NAMES as Record<string, { ko: string; en: string }>;
  return names[String(speciesId)]?.ko ?? `#${speciesId}`;
}
export function normalizeTradeContact(kind: TradeContactKind, value: unknown): string {
  const text = clean(value, "연락 방법", 300);
  if (kind === "friend_code") {
    const code = text.replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(code)) return invalid("invalid_contact", "트레이너 코드는 숫자 12자리로 입력해 주세요.");
    return code;
  }
  if (kind === "discord") {
    if (!/^[a-zA-Z\d_.]{2,32}$/.test(text)) return invalid("invalid_contact", "Discord 사용자 이름을 영문·숫자·밑줄·점 2~32자로 입력해 주세요.");
    return text;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname !== "open.kakao.com" || url.port || url.username || url.password || !/^\/o\/[a-zA-Z\d]+\/?$/.test(url.pathname)) throw new Error();
    return url.href;
  } catch { return invalid("invalid_contact", "카카오 오픈채팅은 https://open.kakao.com/o/로 시작하는 공개 초대 주소를 입력해 주세요."); }
}
export function validateTradeSubmission(input: unknown): TradeSubmission {
  const allowed = new Set(["visitorId", "ownerKey", "trainerName", "cityId", "mode", "offer", "want", "contactKind", "contactValue", "contactPublicConsent", "notes", "expiresInDays", "website"]);
  if (!object(input) || Object.keys(input).some(key => !allowed.has(key)) || typeof input.visitorId !== "string" || !UUID.test(input.visitorId) || !validTradeOwnerKey(input.ownerKey)) return invalid("invalid_payload", "모집 글 내용을 다시 확인해 주세요.");
  if (input.contactPublicConsent !== true) return invalid("consent_required", "닉네임과 연락 방법의 공개에 동의해 주세요.");
  if (typeof input.cityId !== "string" || !CITIES.some(city => city.id === input.cityId)) return invalid("invalid_city", "목록에서 지역을 선택해 주세요.");
  if (input.mode !== "local" && input.mode !== "remote") return invalid("invalid_mode", "대면 또는 리모트 교환 준비를 선택해 주세요.");
  if (input.contactKind !== "friend_code" && input.contactKind !== "discord" && input.contactKind !== "kakao") return invalid("invalid_contact", "연락 방법을 선택해 주세요.");
  if (input.expiresInDays !== 1 && input.expiresInDays !== 3 && input.expiresInDays !== 7) return invalid("invalid_expiry", "모집 기간은 1일·3일·7일 중 선택해 주세요.");
  return {
    visitorId: input.visitorId.toLowerCase(), ownerKey: input.ownerKey.toLowerCase(), trainerName: clean(input.trainerName, "공개 닉네임", 40),
    cityId: input.cityId, mode: input.mode, offer: pokemon(input.offer), want: pokemon(input.want),
    contactKind: input.contactKind, contactValue: normalizeTradeContact(input.contactKind, input.contactValue), contactPublicConsent: true,
    notes: clean(input.notes, "모집 설명", 500, true, true), expiresInDays: input.expiresInDays,
    ...(input.website !== undefined ? { website: clean(input.website, "website", 200, true) } : {}),
  };
}
