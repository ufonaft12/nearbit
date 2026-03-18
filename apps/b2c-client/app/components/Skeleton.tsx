export function SkeletonAnswer() {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
      <div className="shimmer h-3 w-16 rounded mb-3" />
      <div className="flex flex-col gap-2">
        <div className="shimmer h-4 w-full rounded" />
        <div className="shimmer h-4 w-4/5 rounded" />
        <div className="shimmer h-4 w-3/5 rounded" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <li className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="shimmer h-4 w-3/4 rounded" />
        <div className="shimmer h-3 w-1/2 rounded" />
        <div className="shimmer h-3 w-1/3 rounded" />
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="shimmer h-5 w-16 rounded" />
        <div className="shimmer h-3 w-10 rounded" />
        <div className="shimmer h-3 w-12 rounded" />
      </div>
    </li>
  );
}
