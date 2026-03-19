'use client';

import { useTranslations } from 'next-intl';
import type { PricePoint, PriceStats } from '@/lib/utils/analytics';

interface Props {
  productName: string;
  timeline: PricePoint[];
  stats: PriceStats | null;
}

const CHART_W = 320;
const CHART_H = 100;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/**
 * Inline SVG sparkline chart for price-over-time data.
 * No external chart library — keeps the bundle lightweight.
 */
export function PriceChart({ productName, timeline, stats }: Props) {
  const t = useTranslations('profile');

  if (timeline.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">{productName}</h3>
        <p className="text-sm text-zinc-400">{t('no_analytics')}</p>
      </div>
    );
  }

  // ── Chart geometry ────────────────────────────────────────────────────────────
  const W = CHART_W - PAD.left - PAD.right;
  const H = CHART_H - PAD.top - PAD.bottom;

  const prices = timeline.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1; // avoid division by zero

  function xOf(i: number) {
    return PAD.left + (timeline.length === 1 ? W / 2 : (i / (timeline.length - 1)) * W);
  }

  function yOf(price: number) {
    return PAD.top + H - ((price - minPrice) / priceRange) * H;
  }

  const points = timeline.map((p, i) => `${xOf(i)},${yOf(p.price)}`).join(' ');

  // ── Trend color ────────────────────────────────────────────────────────────────
  const trendColor =
    stats == null
      ? '#94a3b8' // neutral (slate-400)
      : stats.change > 0
        ? '#ef4444' // red — price went up
        : stats.change < 0
          ? '#22c55e' // green — price went down
          : '#94a3b8';

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">{productName}</h3>
        {stats && (
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: trendColor }}
          >
            {stats.change > 0 ? '+' : ''}{stats.change.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Sparkline */}
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        aria-hidden
        className="w-full"
        style={{ maxHeight: CHART_H }}
      >
        {/* Grid line at min / max */}
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={PAD.top} y2={PAD.top} stroke="#e4e4e7" strokeDasharray="3 3" />
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={PAD.top + H} y2={PAD.top + H} stroke="#e4e4e7" strokeDasharray="3 3" />

        {/* Y-axis labels */}
        <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
          ₪{maxPrice.toFixed(0)}
        </text>
        <text x={PAD.left - 4} y={PAD.top + H + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
          ₪{minPrice.toFixed(0)}
        </text>

        {/* X-axis date labels (first and last only) */}
        {timeline.length > 1 && (
          <>
            <text x={xOf(0)} y={CHART_H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
              {timeline[0].date.slice(5)} {/* MM-DD */}
            </text>
            <text x={xOf(timeline.length - 1)} y={CHART_H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
              {timeline[timeline.length - 1].date.slice(5)}
            </text>
          </>
        )}

        {/* Line */}
        {timeline.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke={trendColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Data point circles */}
        {timeline.map((p, i) => (
          <circle
            key={i}
            cx={xOf(i)}
            cy={yOf(p.price)}
            r={3}
            fill={trendColor}
          />
        ))}
      </svg>

      {/* Stats row */}
      {stats && (
        <div className="flex gap-4 mt-2 text-xs text-zinc-500 tabular-nums">
          <span>Min <strong className="text-zinc-700 dark:text-zinc-300">₪{stats.min.toFixed(2)}</strong></span>
          <span>Max <strong className="text-zinc-700 dark:text-zinc-300">₪{stats.max.toFixed(2)}</strong></span>
          <span>Latest <strong className="text-zinc-700 dark:text-zinc-300">₪{stats.latest.toFixed(2)}</strong></span>
        </div>
      )}
    </div>
  );
}
