'use client';

import { useState, useMemo } from 'react';
import { Navigation, ShoppingBasket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { removeItem, clearBasket } from '@/lib/store/basketSlice';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /**
   * Set by page.tsx while a silent "Add X" voice command is mid-flight.
   * The floating bar shows a brief "Adding [label]..." status row.
   */
  pendingAddLabel?: string | null;
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

const WhatsAppIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.856L.054 23.25a.75.75 0 0 0 .918.919l5.451-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.512-5.228-1.405l-.375-.217-3.888 1.059 1.025-3.801-.233-.389A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
  </svg>
);

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
  const t  = useTranslations('basket');
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

  if (!hydrated || items.length === 0) return null;

  const totalCost = items.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const multiStore = uniqueStores.length > 1;

  // ── WhatsApp share ─────────────────────────────────────────────────────────
  const shareOnWhatsApp = () => {
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
  };

  // ── Waze — single store ─────────────────────────────────────────────────────
  const openSingleWaze = (store: typeof uniqueStores[number]) => {
    window.open(wazeUrl(store.storeName, store.storeLat, store.storeLng), '_blank', 'noopener');
  };

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-4 pt-0">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl shadow-zinc-900/10 dark:shadow-zinc-950/40 px-4 py-3">

          {/* ── Voice command status toast ────────────────────────────────── */}
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

          {/* ── Summary row ───────────────────────────────────────────────── */}
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

          {/* ── Item chips ────────────────────────────────────────────────── */}
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

          {/* ── Multi-store Waze picker ────────────────────────────────────── */}
          {multiStore && showStorePicker && (
            <div className="mb-2.5 flex flex-col gap-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1">
                {t('chooseStore')}
              </p>
              {uniqueStores.map((store) => (
                <button
                  key={store.storeId}
                  type="button"
                  onClick={() => {
                    openSingleWaze(store);
                    setShowStorePicker(false);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left"
                >
                  <Navigation size={14} className="shrink-0" />
                  <span className="truncate">{store.storeName}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div className="flex gap-2">
            {multiStore ? (
              <button
                type="button"
                onClick={() => setShowStorePicker((v) => !v)}
                aria-expanded={showStorePicker}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold py-2.5 transition-colors"
              >
                <Navigation size={15} /> {t('waze')} {showStorePicker ? '▲' : '▾'}
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
