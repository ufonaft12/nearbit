'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useProfile, useUpdateProfile } from '@/lib/hooks/useProfile';

/**
 * Optional profile fields editor (address, city).
 * Renders a skeleton while loading. Shows save/error feedback inline.
 */
export function ProfileEditForm() {
  const t = useTranslations('profile');
  const { data, isLoading } = useProfile();
  const { mutate, isPending, isSuccess, isError, error } = useUpdateProfile();

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  // Sync form values once data loads
  useEffect(() => {
    if (data) {
      setAddress(data.address ?? '');
      setCity(data.city ?? '');
    }
  }, [data]);

  if (isLoading) {
    return (
      <div role="status" aria-label="loading" className="flex flex-col gap-3">
        <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        <div className="h-9 w-24 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutate({ address: address.trim() || null, city: city.trim() || null });
  }

  return (
    <form
      role="form"
      aria-label={t('edit_profile')}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="profile-address"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {t('address_label')}
        </label>
        <input
          id="profile-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('address_placeholder')}
          maxLength={500}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="profile-city"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {t('city_label')}
        </label>
        <input
          id="profile-city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t('city_placeholder')}
          maxLength={200}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? t('saving') : t('save')}
        </button>

        {isSuccess && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {t('saved')}
          </span>
        )}

        {isError && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {(error as Error).message}
          </span>
        )}
      </div>
    </form>
  );
}
