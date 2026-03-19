"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, RefreshCw, ChevronDown, Clock } from "lucide-react";
import { matchMarketPriceAction } from "@/lib/actions/market";
import type { MarketComparison } from "@/lib/actions/market";

interface Props {
  productId: string;
  ourPrice: number | null;
  comparison: MarketComparison | undefined;
}

/** Format a UTC ISO timestamp as a human-readable staleness label. */
function formatStaleness(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffH = diffMs / 1000 / 3600;
  if (diffH < 1)  return "< 1h ago";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "yesterday";
  if (diffD < 7)  return `${diffD}d ago`;
  return `${Math.floor(diffD / 7)}w ago`;
}

export default function MarketComparisonCell({ productId, ourPrice, comparison }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  if (!comparison || ourPrice === null) {
    return <span className="text-xs text-slate-300 italic">—</span>;
  }

  const delta = ourPrice - comparison.best_price;
  const isAboveMarket = delta > 0;
  const aboveAvgPct =
    comparison.market_avg > 0
      ? ((ourPrice - comparison.market_avg) / comparison.market_avg) * 100
      : 0;

  // Most recent price update across the top-3 competitors
  const newestUpdate = comparison.competitors
    ?.map((c) => c.price_updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const stalenessLabel = formatStaleness(newestUpdate);

  const handleMatchMarket = () => {
    setLocalError(null);
    startTransition(async () => {
      const result = await matchMarketPriceAction(productId);
      if (!result.success) setLocalError(result.error ?? "Failed");
    });
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 min-w-[160px]">
      {/* Best market price + delta */}
      <div className="flex flex-col items-end leading-tight">
        <span className="text-xs text-slate-500">best ₪{comparison.best_price.toFixed(2)}</span>
        <span
          className={`text-xs font-semibold flex items-center gap-0.5 ${
            isAboveMarket ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {isAboveMarket ? "+" : ""}
          {delta.toFixed(2)}₪
          {isAboveMarket ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        </span>
      </div>

      {/* View Details toggle */}
      <button
        onClick={() => setPopoverOpen((v) => !v)}
        className="p-0.5 text-slate-400 hover:text-brand-600 transition-colors rounded"
        title="View competitor details"
      >
        <ChevronDown
          size={14}
          className={`transition-transform ${popoverOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Match Market — only when above market */}
      {isAboveMarket && (
        <button
          onClick={handleMatchMarket}
          disabled={isPending}
          title={`Set price to market average − ₪0.10 (₪${Math.max(
            0.01,
            Math.round((comparison.market_avg - 0.1) * 100) / 100
          ).toFixed(2)})`}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                     bg-brand-50 text-brand-700 hover:bg-brand-100
                     border border-brand-200 rounded-md transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={10} className={isPending ? "animate-spin" : ""} />
          Match
        </button>
      )}

      {localError && (
        <span className="text-xs text-red-500 shrink-0" title={localError}>!</span>
      )}

      {/* ── Competitor Details Popover ───────────────────────────── */}
      {popoverOpen && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50
                     w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3
                     text-left"
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">
              {comparison.competitor_count} competitor
              {comparison.competitor_count !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              {/* Staleness badge */}
              {stalenessLabel && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                  <Clock size={9} />
                  {stalenessLabel}
                </span>
              )}
              {/* % vs average */}
              {aboveAvgPct > 0 ? (
                <span className="text-[10px] font-bold text-red-500">
                  +{aboveAvgPct.toFixed(0)}% avg
                </span>
              ) : aboveAvgPct < 0 ? (
                <span className="text-[10px] font-bold text-emerald-600">
                  {aboveAvgPct.toFixed(0)}% avg
                </span>
              ) : null}
            </div>
          </div>

          {/* Competitor rows */}
          <div className="space-y-1.5">
            {comparison.competitors?.slice(0, 3).map((c, i) => {
              const staleness = formatStaleness(c.price_updated_at);
              return (
                <div key={i} className="flex items-start justify-between text-xs gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-slate-700 truncate">
                      {c.chain ?? "Unknown chain"}
                    </span>
                    <span className="text-slate-400 truncate text-[10px]">
                      {c.city ?? ""}
                      {staleness ? ` · ${staleness}` : ""}
                    </span>
                  </div>
                  <span
                    className={`font-semibold shrink-0 ${
                      c.price < ourPrice ? "text-emerald-700" : "text-slate-900"
                    }`}
                  >
                    ₪{c.price.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer: market average */}
          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-xs">
            <span className="text-slate-500">Market average</span>
            <span className="font-semibold text-slate-700">
              ₪{comparison.market_avg.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
