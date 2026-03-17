'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';

import { fetchSearch, SearchError, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '@/lib/search';
import type { SearchResultWithStore, BasketResult } from '@/types/nearbit';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;
const THROTTLE_MS = 800;
const SUGGESTIONS = ['חומוס', 'חלב', 'לחם', 'ביצים', 'שוקולד', 'במבה'] as const;
const BASKET_RE   = /[,،]|\s+(?:and|ו|או|и|или)\s+/gi;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

function shareProductToWhatsApp(r: SearchResultWithStore) {
  const price = r.price != null ? `${r.price.toFixed(2)} ₪` : 'מחיר לא ידוע';
  const text  = `אחי, תראה מה מצאתי ב-Nearbit! 🛒\n${r.nameHe ?? r.normalizedName} – ${price}\n📍 ${r.storeName}\nסבבה דיל! 🤩`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function shareAnswerToWhatsApp(answer: string, query: string) {
  const text = `אחי, שאלתי את Nearbit על "${query}" והנה מה שמצאתי:\n\n${answer}\n\n🛒 nearbit.app`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function openInWaze(storeName: string, lat?: number | null, lng?: number | null) {
  const url = lat && lng
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/livemap/directions?q=${encodeURIComponent(storeName + ' Israel')}`;
  vibrate(30);
  window.open(url, '_blank', 'noopener');
}

function openInMaps(storeName: string, lat?: number | null, lng?: number | null) {
  const url = lat && lng
    ? `https://maps.google.com/maps?q=${lat},${lng}`
    : `https://maps.google.com/maps?q=${encodeURIComponent(storeName + ' Israel')}`;
  vibrate(30);
  window.open(url, '_blank', 'noopener');
}

/**
 * Price-trend helper.
 * Returns null when no previousPrice is available (future DB column).
 */
function getPriceTrend(
  current: number | null,
  previous?: number | null,
): { type: 'up' | 'down' | 'same'; label: string } | null {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.005) return { type: 'same', label: '→ Same price' };
  if (delta < 0)               return { type: 'down', label: `↓ ₪${Math.abs(delta).toFixed(2)}` };
  return                              { type: 'up',   label: `↑ ₪${delta.toFixed(2)}` };
}

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="inline-block w-9 h-9" />;

  const isDark = resolvedTheme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-xl p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ─── WhatsApp icon ────────────────────────────────────────────────────────────

const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.856L.054 23.25a.75.75 0 0 0 .918.919l5.451-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.512-5.228-1.405l-.375-.217-3.888 1.059 1.025-3.801-.233-.389A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
);

// ─── Skeleton components ──────────────────────────────────────────────────────

function SkeletonAnswer() {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
      <div className="shimmer h-3 w-16 rounded mb-3" />
      <div className="flex flex-col gap-2">
        <div className="shimmer h-4 w-full rounded" />
        <div className="shimmer h-4 w-4/5 rounded" />
        <div className="shimmer h-4 w-3/5 rounded" />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <li className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="shimmer h-4 w-3/4 rounded" />
        <div className="shimmer h-3 w-1/2 rounded" />
        <div className="shimmer h-3 w-1/3 rounded" />
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="shimmer h-5 w-16 rounded" />
        <div className="shimmer h-3 w-10 rounded" />
        <div className="shimmer h-3 w-12 rounded" />
      </div>
    </li>
  );
}

// ─── DirectionsButtons ────────────────────────────────────────────────────────

interface DirectionProps {
  storeName: string;
  storeLat?: number | null;
  storeLng?: number | null;
}

function DirectionsButtons({ storeName, storeLat, storeLng }: DirectionProps) {
  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        type="button"
        onClick={() => openInWaze(storeName, storeLat, storeLng)}
        aria-label={`Open ${storeName} in Waze`}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
      >
        🚗 Waze
      </button>
      <span className="text-zinc-300 dark:text-zinc-600 text-xs">|</span>
      <button
        type="button"
        onClick={() => openInMaps(storeName, storeLat, storeLng)}
        aria-label={`Open ${storeName} in Google Maps`}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        🗺️ Maps
      </button>
    </div>
  );
}

// ─── BasketSummaryCard ────────────────────────────────────────────────────────

function BasketSummaryCard({
  basket,
  query,
}: {
  basket: BasketResult;
  query:  string;
}) {
  return (
    <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-5 py-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            🧺 Basket Mode
          </span>
          <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300 truncate max-w-xs">
            {basket.items.join(' · ')}
          </p>
        </div>
        {basket.savings > 0.5 && (
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Max savings</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-400">
              ₪{basket.savings.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Share basket summary */}
      <button
        type="button"
        onClick={() => {
          const text = basket.storeOptions[0]
            ? `אחי, מצאתי את הסל הכי משתלם ב-Nearbit! 🧺\n${basket.items.join(', ')}\n🏆 ${basket.storeOptions[0].storeName}: ₪${basket.storeOptions[0].totalCost.toFixed(2)}\nסבבה! 🤩`
            : `Found basket "${query}" on Nearbit 🛒`;
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        }}
        className="mb-3 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-500 hover:text-green-700 transition-colors"
      >
        <WhatsAppIcon />
        שתף את הסל
      </button>

      {/* Store comparison rows */}
      <div className="flex flex-col gap-2">
        {basket.storeOptions.slice(0, 3).map((s, i) => (
          <div
            key={s.storeId}
            className={`rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${
              i === 0
                ? 'bg-green-100 dark:bg-green-950/40 ring-1 ring-green-300 dark:ring-green-800'
                : 'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {i === 0 && <span className="text-base shrink-0">🏆</span>}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                  {s.storeName}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {s.itemsFound}/{s.totalItems} items
                </p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {s.items.map((it) => (
                    <span
                      key={it.query}
                      className="text-[10px] bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5 text-zinc-500 dark:text-zinc-400"
                    >
                      {it.productName} ₪{it.price.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 gap-1">
              <span
                className={`text-lg font-bold ${
                  i === 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-zinc-700 dark:text-zinc-300'
                }`}
              >
                ₪{s.totalCost.toFixed(2)}
              </span>
              <DirectionsButtons storeName={s.storeName} storeLat={s.storeLat} storeLng={s.storeLng} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  result: SearchResultWithStore;
}

const ProductCard = memo(function ProductCard({ result: r }: ProductCardProps) {
  const subtitle = useMemo(
    () => [r.nameEn, r.category, r.unit].filter(Boolean).join(' · '),
    [r.nameEn, r.category, r.unit],
  );

  const trend = getPriceTrend(r.price, r.previousPrice);

  // Scarcity thresholds
  const isLowStock  = r.quantity != null && r.quantity > 0 && r.quantity < 5;
  const isOutOfStock = r.quantity === 0;

  return (
    <li className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-start justify-between gap-4">
      {/* Left column */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="font-medium text-zinc-900 dark:text-zinc-50 truncate"
          dir="rtl"
          title={r.nameHe ?? r.normalizedName}
        >
          {r.nameHe ?? r.normalizedName}
        </span>

        {subtitle && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</span>
        )}

        <span className="text-xs text-zinc-400">{r.storeName}</span>

        {/* Directions + Share row */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <DirectionsButtons storeName={r.storeName} storeLat={r.storeLat} storeLng={r.storeLng} />
          <button
            type="button"
            onClick={() => shareProductToWhatsApp(r)}
            aria-label={`Share ${r.nameHe ?? r.normalizedName} on WhatsApp`}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500 hover:text-green-700 dark:hover:text-green-400 transition-colors"
          >
            <WhatsAppIcon />
            <span>שתף</span>
          </button>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col items-end shrink-0 gap-1">
        {r.price != null && (
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            ₪{r.price.toFixed(2)}
          </span>
        )}

        {/* Price trend (renders when previousPrice is available) */}
        {trend && (
          <span
            className={`text-[11px] font-medium ${
              trend.type === 'down' ? 'text-green-600 dark:text-green-400' :
              trend.type === 'up'   ? 'text-red-500  dark:text-red-400'   :
                                      'text-zinc-400'
            }`}
          >
            {trend.label}
          </span>
        )}

        {/* Distance badge */}
        {r.distanceKm != null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            📍 {r.distanceKm} km
          </span>
        )}

        {/* Scarcity alert */}
        {isLowStock && (
          <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
            ⚠️ {r.quantity} left!
          </span>
        )}
        {isOutOfStock && (
          <span className="text-[11px] font-semibold text-red-500 dark:text-red-400">
            Out of stock
          </span>
        )}

        <span className="text-[11px] text-zinc-400">
          {(r.similarity * 100).toFixed(0)}% match
        </span>
      </div>
    </li>
  );
});

// ─── Home ─────────────────────────────────────────────────────────────────────

type LocStatus = 'idle' | 'requesting' | 'active' | 'denied';

export default function Home() {
  const [inputValue, setInputValue]         = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [userLocation, setUserLocation]     = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus]           = useState<LocStatus>('idle');

  const resultsAnchorRef = useRef<HTMLDivElement>(null);

  // ── Basket detection (client-side, mirrors server logic) ──────────────────
  const isBasketQuery = useMemo(() => {
    const items = committedQuery
      .split(BASKET_RE)
      .map((s) => s.trim())
      .filter((s) => s.length >= MIN_QUERY_LENGTH);
    return items.length >= 2;
  }, [committedQuery]);

  // ── Debounce ───────────────────────────────────────────────────────────────
  const debouncedCommit = useRef(
    debounce((value: string) => {
      const trimmed = value.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) setCommittedQuery(trimmed);
    }, DEBOUNCE_MS),
  ).current;

  useEffect(() => () => debouncedCommit.cancel(), [debouncedCommit]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, MAX_QUERY_LENGTH);
      setInputValue(value);
      debouncedCommit(value);
    },
    [debouncedCommit],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      debouncedCommit.cancel();
      const trimmed = inputValue.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) setCommittedQuery(trimmed);
    },
    [inputValue, debouncedCommit],
  );

  const throttledSuggestion = useRef(
    throttle(
      (s: string) => { setInputValue(s); setCommittedQuery(s); },
      THROTTLE_MS,
      { trailing: false },
    ),
  ).current;

  const handleSuggestion = useCallback(
    (s: string) => { debouncedCommit.cancel(); throttledSuggestion(s); },
    [debouncedCommit, throttledSuggestion],
  );

  // ── Geolocation ───────────────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocStatus('denied'); return; }
    setLocStatus('requesting');
    vibrate(30);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus('active');
        vibrate([30, 50, 30]);
      },
      () => setLocStatus('denied'),
      { timeout: 10_000 },
    );
  }, []);

  // ── TanStack Query ─────────────────────────────────────────────────────────
  const { data, isFetching, isError, error, isSuccess } = useQuery({
    queryKey: ['search', committedQuery, userLocation] as const,
    queryFn:  ({ signal }) => fetchSearch(committedQuery, signal, userLocation ?? undefined),
    enabled:  committedQuery.length >= MIN_QUERY_LENGTH,
  });

  // ── Haptic + scroll-to-results when data lands ────────────────────────────
  useEffect(() => {
    if (!data) return;
    vibrate(50);
    resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isNetworkError  = isError && error instanceof SearchError && error.isNetworkError;
  const hasResults      = isSuccess && data.results.length > 0;
  const showInitialHint = !isFetching && !isSuccess && !isError;
  const nearLimit       = inputValue.length > MAX_QUERY_LENGTH * 0.8;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Nearbit
            </span>
            <span className="text-sm text-zinc-400 hidden sm:inline">/ local store search</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 flex flex-col gap-8">

        {/* ── Search box ── */}
        <section>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="חפש מוצר... (חלב, ביצים, חומוס or milk, eggs)"
              dir="auto"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_QUERY_LENGTH}
              aria-label="Search products"
              className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <button
              type="submit"
              disabled={isFetching || inputValue.trim().length < MIN_QUERY_LENGTH}
              aria-busy={isFetching}
              className="rounded-xl bg-zinc-900 dark:bg-zinc-50 px-5 py-3 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-40 hover:opacity-80"
            >
              {isFetching ? '...' : 'Search'}
            </button>

            {/* Location button */}
            <button
              type="button"
              onClick={requestLocation}
              disabled={locStatus === 'requesting' || locStatus === 'denied'}
              title={
                locStatus === 'active'     ? 'Location active'        :
                locStatus === 'denied'     ? 'Location denied'        :
                locStatus === 'requesting' ? 'Requesting location…'   :
                'Share my location for distances'
              }
              aria-label="Share location"
              className={`rounded-xl border px-3 py-3 text-lg transition-colors disabled:opacity-40 ${
                locStatus === 'active'
                  ? 'border-green-400 text-green-500 bg-green-50 dark:bg-green-950/30'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {locStatus === 'requesting' ? '⏳' : locStatus === 'denied' ? '🚫' : '📍'}
            </button>
          </form>

          {nearLimit && (
            <p className="mt-1 text-right text-xs text-zinc-400">
              {inputValue.length} / {MAX_QUERY_LENGTH}
            </p>
          )}

          {/* Basket mode indicator */}
          {isBasketQuery && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              🧺 Basket mode — comparing prices across stores
            </p>
          )}

          {/* Suggestion chips */}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* ── Initial hint ── */}
        {showInitialHint && (
          <p className="text-center text-sm text-zinc-400">
            Type at least {MIN_QUERY_LENGTH} characters — or try a basket: "חלב, ביצים, חומוס"
          </p>
        )}

        {/* ── Network error ── */}
        {isNetworkError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Connection error</p>
            <p className="mt-0.5 text-sm text-red-600/80 dark:text-red-400/80">
              Could not reach the server. Check your connection and try again.
            </p>
          </div>
        )}

        {/* ── API error ── */}
        {isError && !isNetworkError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error instanceof Error ? error.message : 'Search failed. Please try again.'}
          </div>
        )}

        {/* ── Skeleton loaders (shimmer) ── */}
        {isFetching && (
          <div aria-busy="true" aria-label="Loading results" className="flex flex-col gap-3">
            <SkeletonAnswer />
            <ul className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </ul>
          </div>
        )}

        {/* Invisible scroll anchor — positioned just above the results */}
        <div ref={resultsAnchorRef} className="-mt-4" aria-hidden="true" />

        {/* ── Results ── */}
        {!isFetching && isSuccess && (
          <section aria-label="Search results" className="flex flex-col gap-4">

            {/* LLM answer card */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Assistant
                </p>
                <button
                  type="button"
                  onClick={() => shareAnswerToWhatsApp(data.answer, committedQuery)}
                  aria-label="Share answer on WhatsApp"
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                >
                  <WhatsAppIcon />
                  שתף
                </button>
              </div>
              <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">
                {data.answer}
              </p>
            </div>

            {/* Basket summary (only for multi-item searches) */}
            {data.basket && (
              <BasketSummaryCard basket={data.basket} query={committedQuery} />
            )}

            {/* Product list */}
            {hasResults ? (
              <>
                <p className="px-1 text-xs text-zinc-400">
                  {data.results.length} result{data.results.length !== 1 ? 's' : ''}{' '}
                  for &ldquo;{committedQuery}&rdquo;
                </p>
                <ul className="flex flex-col gap-2" role="list" aria-label="Product results">
                  {data.results.map((r) => (
                    <ProductCard key={r.id} result={r} />
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-zinc-400">
                <span className="text-3xl" aria-hidden="true">🔍</span>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  No products found
                </p>
                <p className="max-w-xs text-center text-xs">
                  Try a different search term, or run{' '}
                  <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 font-mono">
                    npm run seed
                  </code>{' '}
                  to populate the database.
                </p>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
