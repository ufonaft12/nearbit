// ============================================================
// Nearbit – i18n Configuration
// Supported locales: Hebrew (he), English (en), Russian (ru)
// ============================================================

export type Locale = 'he' | 'en' | 'ru';

export const LOCALES: Locale[] = ['he', 'en', 'ru'];

/** Locales that require right-to-left text direction. */
export const RTL_LOCALES: Locale[] = ['he'];

/** Short labels shown in the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  he: 'עב',
  en: 'EN',
  ru: 'RU',
};

/** Suggestion chips per locale (food names recognisable in that language). */
export const SUGGESTIONS_BY_LOCALE: Record<Locale, readonly string[]> = {
  he: ['חומוס', 'חלב', 'לחם', 'ביצים', 'שוקולד', 'במבה'],
  en: ['hummus', 'milk', 'bread', 'eggs', 'chocolate', 'bamba'],
  ru: ['хумус', 'молоко', 'хлеб', 'яйца', 'шоколад', 'бамба'],
};

/** localStorage key for persisting the chosen locale. */
export const LOCALE_STORAGE_KEY = 'nearbit:locale';

/**
 * Detects the best locale from localStorage → navigator.languages → default 'he'.
 * Safe to call only on the client side.
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'he';

  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (saved && (LOCALES as string[]).includes(saved)) return saved;
  } catch { /* localStorage blocked (private mode, etc.) */ }

  for (const lang of navigator.languages ?? [navigator.language ?? '']) {
    if (lang.startsWith('he') || lang.startsWith('iw')) return 'he';
    if (lang.startsWith('ru')) return 'ru';
    if (lang.startsWith('en')) return 'en';
  }

  return 'he'; // Israel-first default
}

/** Map app locale → Web Speech API BCP-47 language tag. */
export const STT_LANG: Record<Locale, 'he-IL' | 'ru-RU' | 'en-US'> = {
  he: 'he-IL',
  ru: 'ru-RU',
  en: 'en-US',
};
