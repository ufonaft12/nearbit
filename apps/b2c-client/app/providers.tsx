'use client';

import { useRef, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

import { makeStore, type AppStore } from '@/lib/store/store';
import { hydrateBasket } from '@/lib/store/basketSlice';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASKET_STORAGE_KEY = 'nearbit:basket';

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
      <StoreProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}
