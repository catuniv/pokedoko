"use client";

import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { INTL_LOCALES, LANGUAGE_STORAGE_KEY, isLanguage, persistLanguage, readLanguage, translateText, type Language } from "@/lib/i18n";

type LanguageContextValue = { language: Language; intlLocale: string; setLanguage: (language: Language) => void; t: (text: string) => string };
const LanguageContext = createContext<LanguageContextValue>({ language: "ko", intlLocale: "ko-KR", setLanguage: () => undefined, t: text => text });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<Language>("ko");
  useEffect(() => {
    try { setCurrentLanguage(readLanguage(window.localStorage)); } catch { /* Korean remains usable when storage is blocked. */ }
    const changed = (event: StorageEvent) => { if (event.key === LANGUAGE_STORAGE_KEY && isLanguage(event.newValue)) setCurrentLanguage(event.newValue); };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((next: Language) => {
    if (!isLanguage(next)) return;
    setCurrentLanguage(next);
    try { persistLanguage(window.localStorage, next); } catch { /* Keep the chosen language for this session. */ }
  }, []);
  const t = useCallback((text: string) => translateText(text, language), [language]);
  const value = useMemo(() => ({ language, intlLocale: INTL_LOCALES[language], setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage(): LanguageContextValue { return useContext(LanguageContext); }

const TEXT_ATTRIBUTES = ["title", "placeholder", "aria-label", "aria-description", "aria-valuetext", "alt"] as const;
/** Translate React-owned text/accessible labels without mutating DOM nodes or input values. */
export function localizeReactContent(nodes: ReactNode, t: (text: string) => string): ReactNode {
  return Children.map(nodes, node => {
    if (typeof node === "string") return t(node);
    if (!isValidElement<Record<string, unknown>>(node)) return node;
    const props = node.props;
    if (props["data-i18n-preserve"] !== undefined && props["data-i18n-preserve"] !== false || props.translate === "no" || node.type === "script" || node.type === "style") return node;
    const translated: Record<string, unknown> = {};
    if (node.type === "option" && props.value === undefined) {
      const content = Children.toArray(props.children as ReactNode);
      if (content.every(part => typeof part === "string" || typeof part === "number")) translated.value = content.join("");
    }
    for (const key of TEXT_ATTRIBUTES) if (typeof props[key] === "string") translated[key] = t(props[key]);
    if (props.children !== undefined) translated.children = localizeReactContent(props.children as ReactNode, t);
    return cloneElement(node, translated);
  });
}
export function LanguageScope({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return <>{localizeReactContent(children, t)}</>;
}
