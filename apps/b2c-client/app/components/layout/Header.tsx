'use client';

import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/app/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/app/components/ui/LanguageSwitcher';

export function Header() {
  const t = useTranslations('header');

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl px-6 py-3">
      <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold tracking-tighter">N</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nearbit
          </span>
          <span className="text-xs text-zinc-400 hidden sm:inline">{t('tagline')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
