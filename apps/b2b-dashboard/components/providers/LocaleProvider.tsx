"use client";

import { createContext, useContext, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { Locale } from "@/i18n/locale";
import { getDir } from "@/i18n/locale";

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "he",
  dir: "rtl",
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function LocaleProvider({
  children,
  initialLocale,
  allMessages,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  allMessages: Record<Locale, Record<string, unknown>>;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    // Update html attributes for RTL/LTR instantly
    document.documentElement.lang = next;
    document.documentElement.dir = getDir(next);
    // Persist cookie asynchronously — no await, no reload
    fetch(`/api/set-locale?locale=${next}`, { method: "POST" });
  };

  return (
    <LocaleContext.Provider value={{ locale, dir: getDir(locale), setLocale }}>
      <NextIntlClientProvider locale={locale} messages={allMessages[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
