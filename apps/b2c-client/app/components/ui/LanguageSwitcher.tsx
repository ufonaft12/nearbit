'use client';

import { useLocale } from '@/app/providers';
import { type Locale, LOCALE_LABELS, LOCALES } from '@/lib/i18n/config';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            locale === l
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
