'use client';

import { useState, useMemo, useCallback } from 'react';
import { Navigation, ShoppingBasket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { removeItem, clearBasket } from '@/lib/store/basketSlice';
import { WhatsAppIcon } from '@/app/components/ui/WhatsAppIcon';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /**
   * Set by page.tsx while a silent "Add X" voice command is mid-flight.
   * The floating bar shows a brief "Adding [label]..." status row.
   */
  pendingAddLabel?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wazeUrl(storeName: string, lat?: number | null, lng?: number | null) {
  return lat != null && lng != null
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/livemap/directions?q=${encodeURIComponent(storeName + ' Israel')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BasketFloatingBar({ pendingAddLabel }: Props) {
  const dispatch = useAppDispatch();
  const { items, hydrated } = useAppSelector((s) => s.basket);
  const t   = useTranslations('basket');
  const tWa = useTranslations('whatsapp');

  const [showStorePicker, setShowStorePicker] = useState(false);

  const uniqueStores = useMemo(() => {
    const seen = new Map<string, { storeId: string; storeName: string; storeLat?: number | null; storeLng?: number | null }>();
    for (const item of items) {
      if (!seen.has(item.storeId)) {
        seen.set(item.storeId, {
          storeId:   item.storeId,
          storeName: item.storeName,
          storeLat:  item.storeLat,
          storeLng:  item.storeLng,
        });
      }
    }
    return [...seen.values()];
  }, [items]);

  // Derived values — safe to compute even when basket is empty (guards below handle rendering)
  const totalCost  = useMemo(() => items.reduce((sum, i) => sum + (i.price ?? 0), 0), [items]);
  const multiStore = uniqueStores.length > 1;

  // ── WhatsApp share ──────────────────────────────────────────────────────────
  const shareOnWhatsApp = useCallback(() => {
    const byStore = new Map<string, { storeName: string; lines: string[] }>();
    for (const item of items) {
      if (!byStore.has(item.storeId)) {
        byStore.set(item.storeId, { storeName: item.storeName, lines: [] });
      }
      const price = item.price != null ? ` – ₪${item.price.toFixed(2)}` : '';
      byStore.get(item.storeId)!.lines.push(`✅ ${item.name}${price}`);
    }

    const storeBlocks = [...byStore.values()]
      .map(({ storeName, lines }) => `🏪 ${storeName}:\n${lines.join('\n')}`)
      .join('\n\n');

    const text = [
      tWa('basketHeader'),
      storeBlocks,
      tWa('basketTotal', { total: totalCost.toFixed(2) }),
      tWa('basketFooter'),
    ].join('\n\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }, [items, totalCost, tWa]);

  const openSingleWaze = useCallback((store: typeof uniqueStores[number]) => {
    window.open(wazeUrl(store.storeName, store.storeLat, store.storeLng), '_blank', 'noopener');
  }, []);

  // ── Guard: only render once hydrated and basket is non-empty ────────────────
  if (!hydrated || items.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-4 pt-0">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl shadow-zinc-900/10 dark:shadow-zinc-950/40 px-4 py-3">

          {/* Voice command status toast */}
          {pendingAddLabel && (
            <div className="flex items-center gap-2 mb-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5">
              <span
                className="inline-block w-3.5 h-3.5 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin"
                aria-hidden="true"
              />
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
                {t('adding', { label: pendingAddLabel })}
              </p>
            </div>
          )}

          {/* Summary row */}
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                <ShoppingBasket size={14} />
                {t('itemCount', { count: items.length })}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('estimated')}{' '}
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  ₪{totalCost.toFixed(2)}
                </span>
                {multiStore && (
                  <span className="ml-1 text-amber-500 dark:text-amber-400">
                    · {t('stores', { count: uniqueStores.length })}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dispatch(clearBasket())}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {t('clearAll')}
            </button>
          </div>

          {/* Item chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300"
              >
                {item.name}
                {item.price != null && (
                  <span className="text-zinc-400 dark:text-zinc-500 ml-0.5">
                    ₪{item.price.toFixed(2)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => dispatch(removeItem(item.id))}
                  aria-label={t('removeItem', { name: item.name })}
                  className="ml-0.5 text-zinc-400 hover:text-red-500 transition-colors leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* Multi-store Waze picker */}
          {multiStore && showStorePicker && (
            <div className="mb-2.5 flex flex-col gap-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1">
                {t('chooseStore')}
              </p>
              {uniqueStores.map((store) => (
                <button
                  key={store.storeId}
                  type="button"
                  onClick={() => { openSingleWaze(store); setShowStorePicker(false); }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left"
                >
                  <Navigation size={14} className="shrink-0" />
                  <span className="truncate">{store.storeName}</span>
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {multiStore ? (
              <button
                type="button"
                onClick={() => setShowStorePicker((v) => !v)}
                aria-expanded={showStorePicker}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold py-2.5 transition-colors"
              >
                <Navigation size={15} />
                {t('waze')}
                {showStorePicker ? ' ▲' : ' ▾'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openSingleWaze(uniqueStores[0])}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold py-2.5 transition-colors"
              >
                <Navigation size={15} /> {t('waze')}
              </button>
            )}

            <button
              type="button"
              onClick={shareOnWhatsApp}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold py-2.5 transition-colors"
            >
              <WhatsAppIcon />
              {t('shareWhatsApp')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
