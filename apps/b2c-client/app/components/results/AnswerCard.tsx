'use client';

import { useTranslations } from 'next-intl';
import { WhatsAppIcon } from '@/app/components/ui/WhatsAppIcon';

interface Props {
  answer: string;
  query:  string;
}

export function AnswerCard({ answer, query }: Props) {
  const t   = useTranslations('results');
  const tWa = useTranslations('whatsapp');

  const share = () => {
    const text = tWa('answerText', { query, answer });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {t('assistant')}
        </p>
        <button
          type="button"
          onClick={share}
          aria-label={t('shareAriaLabel')}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
        >
          <WhatsAppIcon />
          {t('share')}
        </button>
      </div>
      <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">
        {answer}
      </p>
    </div>
  );
}
