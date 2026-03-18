'use client';

import { useEffect } from 'react';
import { useLocale } from '@/app/providers';
import { RTL_LOCALES } from '@/lib/i18n/config';

/**
 * Keeps <html lang> and <html dir> in sync with the active locale.
 * Renders nothing — purely a side-effect component.
 * Must live inside LocaleProvider (i.e. inside Providers in layout.tsx).
 */
export function HtmlDirSync() {
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir  = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  return null;
}
