'use client';

import { useRef, useEffect, useState, createContext, useContext, useCallback } from 'react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { NextIntlClientProvider } from 'next-intl';

import { makeStore, type AppStore } from '@/lib/store/store';
import { hydrateBasket } from '@/lib/store/basketSlice';
import { type Locale, LOCALE_STORAGE_KEY, detectLocale } from '@/lib/i18n/config';

import heMessages from '../messages/he.json';
import enMessages from '../messages/en.json';
import ruMessages from '../messages/ru.json';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASKET_STORAGE_KEY = 'nearbit:basket';

const ALL_MESSAGES = {
  he: heMessages,
  en: enMessages,
  ru: ruMessages,
} as const;

// ─── Locale Context ───────────────────────────────────────────────────────────

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'he',
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

// ─── LocaleProvider ───────────────────────────────────────────────────────────

function LocaleProvider({ children }: { children: React.ReactNode }) {
  // SSR default = 'he' (Israel-first); client detects real locale on mount.
  const [locale, setLocaleState] = useState<Locale>('he');

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch { /* localStorage blocked */ }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={ALL_MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

// ─── StoreProvider ────────────────────────────────────────────────────────────

/**
 * Creates one Redux store per browser session (useRef ensures stability across
 * React re-renders without creating a module-level singleton, which is
 * incompatible with Next.js App Router's per-request server rendering).
 *
 * SSR-safe hydration pattern:
 *   • The store always initialises with empty state (hydrated=false).
 *   • After the first client-side mount, localStorage is read and a single
 *     hydrateBasket action is dispatched.  All basket-dependent UI is gated
 *     on the `hydrated` flag so the server-rendered HTML and the first client
 *     paint are identical — zero hydration mismatches.
 *
 * Persistence:
 *   • A store.subscribe() listener writes to localStorage on every change,
 *     but only after hydration is complete (avoids overwriting saved data
 *     with the empty initial state).
 */
function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  useEffect(() => {
    const store = storeRef.current!;

    // 1. Load persisted basket from localStorage
    try {
      const raw = localStorage.getItem(BASKET_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { items?: unknown; strategy?: unknown };
        store.dispatch(
          hydrateBasket({
            items:    Array.isArray(saved.items)    ? saved.items    : [],
            strategy: saved.strategy === 'near'     ? 'near'         : 'cheap',
          }),
        );
      } else {
        store.dispatch(hydrateBasket({ items: [], strategy: 'cheap' }));
      }
    } catch {
      store.dispatch(hydrateBasket({ items: [], strategy: 'cheap' }));
    }

    // 2. Persist on every subsequent change (gated on hydrated=true to avoid
    //    overwriting saved data with the empty pre-hydration initial state)
    const unsubscribe = store.subscribe(() => {
      const { basket } = store.getState();
      if (!basket.hydrated) return;
      try {
        localStorage.setItem(
          BASKET_STORAGE_KEY,
          JSON.stringify({ items: basket.items, strategy: basket.strategy }),
        );
      } catch { /* quota exceeded — silently ignore */ }
    });

    return unsubscribe;
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}

// ─── Providers ────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:            1000 * 60 * 5,
            retry:                1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    /*
      attribute="class"         — next-themes adds/removes "dark" on <html>
      defaultTheme="system"     — respect OS preference on first load
      disableTransitionOnChange — prevents flash of unstyled transitions
    */
    <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange>
      <LocaleProvider>
        <StoreProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </StoreProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
