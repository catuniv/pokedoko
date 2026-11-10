"use client";

import { Globe2 } from "lucide-react";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";
import "./language.css";

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-bar"><nav className="language-selector" aria-label="Language / 语言 / 言語"><Globe2 size={15} aria-hidden="true" />{LANGUAGES.map(code => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setLanguage(code)}>{LANGUAGE_LABELS[code]}</button>)}</nav></div>;
}
