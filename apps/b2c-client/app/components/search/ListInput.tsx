'use client';

/**
 * ListInput — chip-based basket builder.
 *
 * Shown automatically when the user types ≥2 comma/newline-separated items
 * in the main textarea. Replaces the textarea with a tag-list UI:
 *
 *   [молоко ×]  [яйца ×]  [хлеб ×]
 *   ┌─────────────────────────────┐
 *   │ Добавить товар...        [+]│
 *   └─────────────────────────────┘
 *
 * Props:
 *   items          — controlled array of item strings
 *   onItemsChange  — called whenever the list changes (add / remove)
 *   onBack         — called when user wants to return to text mode
 */

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { Plus, ArrowLeft, ListChecks } from 'lucide-react';

interface Props {
  items:         string[];
  onItemsChange: (items: string[]) => void;
  onBack:        () => void;
}

export function ListInput({ items, onItemsChange, onBack }: Props) {
  const t = useTranslations('search');

  const [addValue, setAddValue] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const commitAdd = useCallback(() => {
    const trimmed = addValue.trim();
    if (!trimmed) return;

    const segments = trimmed
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (segments.length > 0) onItemsChange([...items, ...segments]);
    setAddValue('');
  }, [addValue, items, onItemsChange]);

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitAdd();
      } else if (e.key === 'Escape') {
        if (addValue === '') onBack();
        else setAddValue('');
      } else if (e.key === 'Backspace' && addValue === '' && items.length > 0) {
        const next = items.slice(0, -1);
        onItemsChange(next);
        if (next.length === 0) onBack();
      }
    },
    [addValue, commitAdd, items, onBack, onItemsChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const next = items.filter((_, i) => i !== index);
      onItemsChange(next);
      if (next.length === 0) onBack();
      addInputRef.current?.focus();
    },
    [items, onItemsChange, onBack],
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <ListChecks size={13} />
          {t('listMode')}
        </span>
        <button
          type="button"
          onClick={onBack}
          title={t('backToSearch')}
          aria-label={t('backToSearch')}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-lg px-1.5 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ArrowLeft size={12} />
          {t('backToSearch')}
        </button>
      </div>

      {/* Chip list */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-1 text-sm font-medium text-amber-900 dark:text-amber-200"
            >
              {item}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                aria-label={t('removeItemAriaLabel', { name: item })}
                className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800 hover:text-amber-900 dark:hover:text-amber-100 transition-colors leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add-item input */}
      <div className="flex items-center gap-2">
        <input
          ref={addInputRef}
          type="text"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={handleAddKeyDown}
          placeholder={t('addItemPlaceholder')}
          aria-label={t('addItemAriaLabel')}
          autoComplete="off"
          dir="auto"
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={commitAdd}
          disabled={!addValue.trim()}
          aria-label={t('addItemAriaLabel')}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-30 text-white transition-colors shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[11px] text-zinc-400 -mt-1">
        {t('listHelpText')}
      </p>
    </div>
  );
}
