'use client';

import { useEffect } from 'react';
import { RTL_LOCALES, type Locale } from '@/lib/i18n/config';
import { useLocale } from '@/app/providers';

/**
 * Keeps <html lang dir> in sync with the active locale.
 * Must be rendered inside LocaleProvider.
 */
export function HtmlDirSync() {
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.includes(locale as Locale) ? 'rtl' : 'ltr';
  }, [locale]);

  return null;
}
