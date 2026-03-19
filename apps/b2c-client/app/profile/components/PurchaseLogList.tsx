'use client';

import { useTranslations } from 'next-intl';
import { usePurchaseLog } from '@/lib/hooks/useHistory';

/**
 * Renders the logged-in user's purchase log with React Query.
 */
export function PurchaseLogList() {
  const t = useTranslations('profile');
  const { data, isLoading } = usePurchaseLog();

  if (isLoading) {
    return (
      <ul aria-label="loading" role="status" className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        ))}
      </ul>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-4">{t('purchases_empty')}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {item.product_name}
            </span>
            <span className="text-xs text-zinc-400">{item.store_name}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {item.price_paid != null ? `₪${item.price_paid.toFixed(2)}` : '—'}
            </span>
            <span className="text-xs text-zinc-400">
              {new Date(item.purchased_at).toLocaleDateString()}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
