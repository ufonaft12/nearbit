'use client';

import { memo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { WhatsAppIcon } from '@/app/components/ui/WhatsAppIcon';

interface Props {
  answer: string;
  query:  string;
}

export const AnswerCard = memo(function AnswerCard({ answer, query }: Props) {
  const t   = useTranslations('results');
  const tWa = useTranslations('whatsapp');

  const share = useCallback(() => {
    const text = tWa('answerText', { query, answer });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }, [tWa, query, answer]);

  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
      <div aria-hidden="true" className="h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
      <div className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
            {t('assistant')}
          </p>
          <button
            type="button"
            onClick={share}
            aria-label={t('shareAriaLabel')}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 border border-green-200 dark:border-green-800 transition-colors"
          >
            <WhatsAppIcon />
            {t('share')}
          </button>
        </div>
        <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">
          {answer}
        </p>
      </div>
    </div>
  );
});
