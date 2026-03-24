'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="inline-block w-9 h-9" />;

  const isDark = resolvedTheme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? t('toLightMode') : t('toDarkMode')}
      className="rounded-xl p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
