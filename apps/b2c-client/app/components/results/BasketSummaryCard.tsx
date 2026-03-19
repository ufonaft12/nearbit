'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingBasket, Trophy } from 'lucide-react';
import { WhatsAppIcon } from '@/app/components/ui/WhatsAppIcon';
import { DirectionsButtons } from '@/app/components/ui/DirectionsButtons';
import type { BasketResult } from '@/types/nearbit';

interface Props {
  basket: BasketResult;
  query:  string;
}

export const BasketSummaryCard = memo(function BasketSummaryCard({ basket, query }: Props) {
  const tBasket = useTranslations('basket');
  const tWa     = useTranslations('whatsapp');

  const shareBasket = () => {
    const text = basket.storeOptions[0]
      ? tWa('basketBestDeal', {
          items: basket.items.join(', '),
          store: basket.storeOptions[0].storeName,
          total: basket.storeOptions[0].totalCost.toFixed(2),
        })
      : tWa('basketFallback', { query });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10 shadow-sm">
      <div aria-hidden="true" className="h-0.5 bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-400" />
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div>
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 w-fit text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <ShoppingBasket size={13} /> {tBasket('mode')}
            </span>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300 truncate max-w-xs">
              {basket.items.join(' · ')}
            </p>
          </div>
          {basket.savings > 0.5 && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                {tBasket('maxSavings')}
              </p>
              <p className="text-xl font-bold text-green-700 dark:text-green-400">
                ₪{basket.savings.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* Share basket */}
        <button
          type="button"
          onClick={shareBasket}
          className="mb-3 flex items-center gap-1.5 rounded-full border border-green-200 dark:border-green-800 px-3 py-1 text-xs font-medium text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors w-fit"
        >
          <WhatsAppIcon />
          {tBasket('shareBasketSummary')}
        </button>

        {/* Store comparison rows */}
        <div className="flex flex-col gap-2">
          {basket.storeOptions.slice(0, 3).map((s, i) => (
            <div
              key={s.storeId}
              className={`rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${
                i === 0
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 ring-1 ring-green-300 dark:ring-green-800'
                  : 'bg-white/80 dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {i === 0 && <Trophy size={16} className="shrink-0 text-amber-500" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                    {s.storeName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {tBasket('itemsFound', { found: s.itemsFound, total: s.totalItems })}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {s.items.map((it) => (
                      <span
                        key={it.query}
                        className="text-[10px] bg-white dark:bg-zinc-800 rounded-full px-2 py-0.5 text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-700"
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
    </div>
  );
});
