'use client';

import { useTranslations } from 'next-intl';
import { useSearchHistory } from '@/lib/hooks/useHistory';

interface Props {
  /** Optional callback when the user clicks a history item to re-run a search */
  onSearch?: (query: string) => void;
}

/**
 * Renders the logged-in user's search history with React Query.
 * Shows a skeleton while loading; empty state when there are no entries.
 */
export function SearchHistoryList({ onSearch }: Props) {
  const t = useTranslations('profile');
  const { data, isLoading } = useSearchHistory();

  if (isLoading) {
    return (
      <ul aria-label="loading" role="status" className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        ))}
      </ul>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-4">{t('history_empty')}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSearch?.(item.query)}
            className="w-full flex items-center justify-between gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group"
          >
            <span className="font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
              {item.query}
            </span>
            <span className="text-xs text-zinc-400 shrink-0">
              {item.results_count} result{item.results_count !== 1 ? 's' : ''} ·{' '}
              {new Date(item.searched_at).toLocaleDateString()}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
