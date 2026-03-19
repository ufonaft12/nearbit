'use client';

import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/app/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/app/components/ui/LanguageSwitcher';

export function Header() {
  const t = useTranslations('header');

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-3">
      <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nearbit
          </span>
          <span className="text-sm text-zinc-400 hidden sm:inline">{t('tagline')}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
