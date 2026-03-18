'use client';

import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, AlertTriangle } from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { DirectionsButtons } from './DirectionsButtons';
import { getPriceTrend } from '@/lib/utils/pricing';
import type { SearchResultWithStore, BasketItem } from '@/types/nearbit';

interface Props {
  result:      SearchResultWithStore;
  searchQuery: string;
  inBasket:    boolean;
  onAdd:       (item: BasketItem) => void;
  onRemove:    (id: string) => void;
  onVibrate:   (pattern: number | number[]) => void;
}

export const ProductCard = memo(function ProductCard({
  result: r,
  searchQuery,
  inBasket,
  onAdd,
  onRemove,
  onVibrate,
}: Props) {
  const t   = useTranslations('product');
  const tWa = useTranslations('whatsapp');

  const subtitle = useMemo(
    () => [r.nameEn, r.category, r.unit].filter(Boolean).join(' · '),
    [r.nameEn, r.category, r.unit],
  );

  const trend = getPriceTrend(r.price, r.previousPrice);

  const isLowStock   = r.quantity != null && r.quantity > 0 && r.quantity < 5;
  const isOutOfStock = r.quantity === 0;

  const productName = r.nameHe ?? r.normalizedName;

  const basketItem = useMemo<BasketItem>(
    () => ({
      id:        r.id,
      name:      productName,
      price:     r.price,
      storeName: r.storeName,
      storeId:   r.storeId,
      query:     searchQuery,
      storeLat:  r.storeLat,
      storeLng:  r.storeLng,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r.id, productName, r.price, r.storeName, r.storeId, searchQuery, r.storeLat, r.storeLng],
  );

  const shareOnWhatsApp = () => {
    const price = r.price != null ? `${r.price.toFixed(2)} ₪` : '—';
    const text  = tWa('productText', { name: productName, price, store: r.storeName });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const trendLabel = trend
    ? trend.type === 'same'
      ? t('priceSame')
      : trend.type === 'down'
      ? `↓ ₪${Math.abs(trend.delta).toFixed(2)}`
      : `↑ ₪${trend.delta.toFixed(2)}`
    : null;

  return (
    <li
      className={`rounded-xl border bg-white dark:bg-zinc-900 px-4 py-3 flex items-start justify-between gap-4 transition-colors ${
        inBasket
          ? 'border-green-300 dark:border-green-700 ring-1 ring-green-200 dark:ring-green-800'
          : 'border-zinc-100 dark:border-zinc-800'
      }`}
    >
      {/* Checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={inBasket}
        aria-label={inBasket ? t('removeFromBasket', { name: productName }) : t('addToBasket', { name: productName })}
        onClick={() => { inBasket ? onRemove(r.id) : onAdd(basketItem); onVibrate(20); }}
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
          inBasket
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-zinc-300 dark:border-zinc-600 hover:border-green-400 dark:hover:border-green-500'
        }`}
      >
        {inBasket && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Left column */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="font-medium text-zinc-900 dark:text-zinc-50 truncate"
          dir="rtl"
          title={productName}
        >
          {productName}
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
            onClick={shareOnWhatsApp}
            aria-label={t('shareAriaLabel', { name: productName })}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500 hover:text-green-700 dark:hover:text-green-400 transition-colors"
          >
            <WhatsAppIcon />
            <span>{t('share')}</span>
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

        {trendLabel && (
          <span
            className={`text-[11px] font-medium ${
              trend?.type === 'down' ? 'text-green-600 dark:text-green-400' :
              trend?.type === 'up'   ? 'text-red-500  dark:text-red-400'   :
                                       'text-zinc-400'
            }`}
          >
            {trendLabel}
          </span>
        )}

        {/* Distance badge */}
        {r.distanceKm != null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <MapPin size={10} /> {r.distanceKm} km
          </span>
        )}

        {isLowStock && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
            <AlertTriangle size={11} /> {t('lowStock', { qty: r.quantity ?? 0 })}
          </span>
        )}
        {isOutOfStock && (
          <span className="text-[11px] font-semibold text-red-500 dark:text-red-400">
            {t('outOfStock')}
          </span>
        )}

        <span className="text-[11px] text-zinc-400">
          {t('match', { score: (r.similarity * 100).toFixed(0) })}
        </span>
      </div>
    </li>
  );
});
