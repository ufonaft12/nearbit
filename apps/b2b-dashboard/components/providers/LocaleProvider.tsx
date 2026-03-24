"use client";

import { createContext, useContext, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
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

async function persistLocale(locale: Locale) {
  await fetch(`/api/set-locale?locale=${locale}`, { method: "POST" });
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [locale, setOptimisticLocale] = useOptimistic<Locale>(initialLocale);

  const setLocale = (next: Locale) => {
    startTransition(async () => {
      setOptimisticLocale(next);
      await persistLocale(next);
      // Soft refresh — re-renders server components with new locale cookie, no asset reload
      router.refresh();
    });
  };

  return (
    <LocaleContext.Provider value={{ locale, dir: getDir(locale), setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
