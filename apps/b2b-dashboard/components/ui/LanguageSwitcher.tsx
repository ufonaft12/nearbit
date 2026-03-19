"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import type { Locale } from "@/i18n/request";

const LABELS: Record<Locale, string> = {
  en: "EN",
  he: "עב",
  ru: "RU",
};

const LOCALES: Locale[] = ["he", "en", "ru"];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1 px-3 py-1.5" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
            locale === l
              ? "bg-brand-600 text-white"
              : "text-slate-500 hover:text-brand-600 hover:bg-brand-50"
          }`}
          aria-pressed={locale === l}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
