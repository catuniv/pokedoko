import translations from "./i18n-messages.json";
import extraTranslations from "./i18n-extra-messages.json";
import pageTranslations from "./i18n-page-messages.json";
import pokemonNames from "./pokemon-names.json";
import localizedPokemonNames from "./pokemon-localized-names.json";

export const LANGUAGES = ["ko", "en", "zh-CN", "ja"] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_STORAGE_KEY = "pokedoko.language.v1";
export const LANGUAGE_LABELS: Record<Language, string> = { ko: "한국어", en: "English", "zh-CN": "简体中文", ja: "日本語" };
export const INTL_LOCALES: Record<Language, string> = { ko: "ko-KR", en: "en-US", "zh-CN": "zh-CN", ja: "ja-JP" };
export const isLanguage = (value: unknown): value is Language => typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
const messages = { ...translations, ...extraTranslations, ...pageTranslations } as unknown as Record<string, readonly [string, string, string]>;
const languageIndex = { en: 0, "zh-CN": 1, ja: 2 } as const;
const pokemon = new Map(Object.entries(pokemonNames).map(([id, names]) => {
  const localized = (localizedPokemonNames as Record<string, { ja?: string; "zh-CN"?: string }>)[id];
  return [names.ko, { en: names.en, "zh-CN": localized?.["zh-CN"] ?? names.en, ja: localized?.ja ?? names.en }];
}));

/** Source names, coordinates and submitted content are never sent to a translation service. */
export function translateText(text: string, language: Language): string {
  if (language === "ko" || !text.trim()) return text;
  const key = text.replace(/\s+/g, " ").trim();
  const direct = messages[key];
  if (direct) return text.replace(text.trim(), direct[languageIndex[language]]);
  // JSX separates labels and dynamic values into individual text fragments.
  const fragment = /^(\s*)(.*?)(\s*[·:：]\s*)$/.exec(text);
  if (fragment) {
    const label = messages[fragment[2].replace(/\s+/g, " ").trim()];
    if (label) return `${fragment[1]}${label[languageIndex[language]]}${fragment[3]}`;
  }
  const species = pokemon.get(key);
  if (species) return species[language];
  for (const prefix of ["로케이션 배경 · ", "스페셜 배경 · "]) if (key.startsWith(prefix)) return `${translateText(prefix.slice(0,-3), language)} · ${key.slice(prefix.length)}`;
  if (key.startsWith("GPS 위치 변경 · ")) return `${translateText("GPS 위치 변경", language)} · ${translateText(key.slice("GPS 위치 변경 · ".length), language)}`;
  for (const [suffix, translatedSuffix] of [
    [" 검색 결과", { en: " search results", "zh-CN": "搜索结果", ja: "の検索結果" }],
    [" 지우기", { en: " clear", "zh-CN": "清除", ja: "を消す" }],
    [" 배경", { en: " background", "zh-CN": "背景", ja: "の背景" }],
  ] as const) if (key.endsWith(suffix)) {
    const prefix = key.slice(0, -suffix.length);
    if (messages[prefix] || suffix === " 배경") return `${translateText(prefix, language)}${translatedSuffix[language]}`;
  }
  let match = /^모집 중 ([\d,]+)개$/.exec(key);
  if (match) return ({ en: `${match[1]} open listings`, "zh-CN": `${match[1]}条招募中`, ja: `募集中 ${match[1]}件` })[language];
  match = /^([\d,]+)\/30개 · 이 기기$/.exec(key);
  if (match) return ({ en: `${match[1]}/30 · this device`, "zh-CN": `${match[1]}/30条 · 本机`, ja: `${match[1]}/30件・この端末` })[language];
  match = /^도감 (\d+)$/.exec(key);
  if (match) return `Pokédex #${match[1]}`;
  match = /^한국시간 (.+)까지$/.exec(key);
  if (match) return `${translateText("한국시간", language)} ${translateText(match[1], language)} ${translateText("까지", language)}`;
  const parts = key.split(" · ");
  if (parts.length > 1 && parts.every(part => !!messages[part] || pokemon.has(part))) return parts.map(part => translateText(part, language)).join(" · ");
  // Numeric dates and durations can be localized without interpreting user prose.
  if (/^[\d\s.,:~–—\-+/%()·년월일시간분초오전후월화수목금토요한국시까지]+$/.test(key)) {
    return key.replace(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g, (_all, y, m, d) => language === "en" ? `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` : `${y}年${m}月${d}日`)
      .replace(/(\d{1,2})월\s*(\d{1,2})일/g, (_all, m, d) => language === "en" ? `${m}/${d}` : `${m}月${d}日`)
      .replace(/\((월|화|수|목|금|토|일)\)/g, (_all, day) => `(${({ en: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], "zh-CN": ["一","二","三","四","五","六","日"], ja: ["月","火","水","木","金","土","日"] }[language])["월화수목금토일".indexOf(day)]})`)
      .replace(/(월|화|수|목|금|토|일)요일/g, (_all, day) => ({ en: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"], "zh-CN": ["星期一","星期二","星期三","星期四","星期五","星期六","星期日"], ja: ["月曜日","火曜日","水曜日","木曜日","金曜日","土曜日","日曜日"] }[language])["월화수목금토일".indexOf(day)])
      .replace(/(\d+)일/g, `$1${language === "en" ? "d" : language === "ja" ? "日" : "天"}`)
      .replace(/오전/g, language === "en" ? "AM" : language === "ja" ? "午前" : "上午").replace(/오후/g, language === "en" ? "PM" : language === "ja" ? "午後" : "下午")
      .replace(/(\d+)시간/g, `$1${language === "en" ? "h" : language === "ja" ? "時間" : "小时"}`).replace(/(\d+)분/g, `$1${language === "en" ? "m" : "分"}`).replace(/(\d+)초/g, `$1${language === "en" ? "s" : "秒"}`);
  }
  return text;
}

export function readLanguage(storage?: Pick<Storage, "getItem">): Language {
  try { const value = storage?.getItem(LANGUAGE_STORAGE_KEY); return isLanguage(value) ? value : "ko"; } catch { return "ko"; }
}
export function persistLanguage(storage: Pick<Storage, "setItem"> | undefined, language: Language): boolean {
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); return !!storage; } catch { return false; }
}
