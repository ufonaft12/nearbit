'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Navigation, Map as MapIcon } from 'lucide-react';
import { openInWaze, openInMaps } from '@/lib/utils/maps';

interface DirectionProps {
  storeName: string;
  storeLat?: number | null;
  storeLng?: number | null;
}

export const DirectionsButtons = memo(function DirectionsButtons({
  storeName,
  storeLat,
  storeLng,
}: DirectionProps) {
  const t = useTranslations('product');
  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        type="button"
        onClick={() => openInWaze(storeName, storeLat, storeLng)}
        aria-label={t('openInWaze', { store: storeName })}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
      >
        <Navigation size={11} /> Waze
      </button>
      <span className="text-zinc-300 dark:text-zinc-600 text-xs">|</span>
      <button
        type="button"
        onClick={() => openInMaps(storeName, storeLat, storeLng)}
        aria-label={t('openInMaps', { store: storeName })}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <MapIcon size={11} /> Maps
      </button>
    </div>
  );
});
