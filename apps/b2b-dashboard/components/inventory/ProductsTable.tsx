"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { Search, Tag, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Product } from "@/types/database";
import type { MarketComparison } from "@/lib/actions/market";
import MarketComparisonCell from "./MarketComparisonCell";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchAction } from "@/hooks/useBatchAction";
import { matchMarketPriceAction } from "@/lib/actions/market";

interface ProductsTableProps {
  products: Product[];
  marketData?: Record<string, MarketComparison>;
  onSelectForTags?: (products: Product[]) => void;
}

// ── Memoized table row ─────────────────────────────────────────────────────────
interface RowProps {
  product: Product;
  comparison: MarketComparison | undefined;
  isSelected: boolean;
  hasMarketData: boolean;
  onToggle: (id: string) => void;
}

const ProductRow = memo(function ProductRow({
  product,
  comparison,
  isSelected,
  hasMarketData,
  onToggle,
}: RowProps) {
  const displayName = product.name_he ?? product.normalized_name ?? product.raw_name;
  const displayPrice = product.sale_price ?? product.price;

  const isPricedHighAboveMarket =
    comparison &&
    displayPrice !== null &&
    comparison.market_avg > 0 &&
    displayPrice > comparison.market_avg * 1.1;

  return (
    <tr
      className={`hover:bg-slate-50 transition-colors ${
        isSelected
          ? "bg-brand-50"
          : isPricedHighAboveMarket
          ? "bg-red-50"
          : ""
      }`}
    >
      <td className="ps-4 pe-2 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(product.id)}
          className="rounded border-slate-300"
        />
      </td>
      {/* Hebrew name — always RTL regardless of page direction */}
      <td className="px-4 py-3 font-medium text-slate-900 text-right" dir="rtl">
        {displayName}
      </td>
      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
        {product.name_ru ?? <span className="text-slate-300 italic">—</span>}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">
        {product.barcode ?? "—"}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-slate-900">
        {displayPrice !== null ? `₪${displayPrice.toFixed(2)}` : "—"}
        {product.sale_price !== null && product.price !== null && (
          <span className="ms-1 text-xs text-slate-400 line-through font-normal">
            ₪{product.price.toFixed(2)}
          </span>
        )}
      </td>
      {hasMarketData && (
        <td className="px-4 py-3">
          <MarketComparisonCell
            productId={product.id}
            ourPrice={displayPrice}
            comparison={comparison}
          />
        </td>
      )}
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            product.is_available
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {product.is_available ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3">
        <button className="p-1 text-slate-400 hover:text-slate-600 rounded">
          <MoreHorizontal size={16} />
        </button>
      </td>
    </tr>
  );
});

// ── Main table component ───────────────────────────────────────────────────────
export default function ProductsTable({
  products,
  marketData,
  onSelectForTags,
}: ProductsTableProps) {
  const t = useTranslations("inventory");
  const [rawSearch, setRawSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Debounce search to avoid re-filtering on every keystroke
  const search = useDebounce(rawSearch, 200);

  // Batch "Match Market" for bulk operations
  const { runBatch, isPending: isBatchPending } = useBatchAction(
    matchMarketPriceAction,
    { chunkSize: 10, delayMs: 100 }
  );

  // Memoized filtering — only recomputes when products or debounced search changes
  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const lower = search.toLowerCase();
    return products.filter((p) => {
      const heb = p.name_he ?? p.normalized_name ?? p.raw_name;
      return (
        heb.includes(search) ||
        (p.name_ru ?? "").toLowerCase().includes(lower) ||
        (p.barcode ?? "").includes(search)
      );
    });
  }, [products, search]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((p) => p.id))
    );
  }, [filtered]);

  const handleBatchMatchMarket = useCallback(async () => {
    const ids = Array.from(selected);
    await runBatch(ids);
  }, [selected, runBatch]);

  const hasMarketData = !!marketData && Object.keys(marketData).length > 0;
  const colSpan = hasMarketData ? 8 : 7;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            className="w-full ps-9 pe-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {selected.size > 0 && onSelectForTags && (
          <button
            onClick={() =>
              onSelectForTags(products.filter((p) => selected.has(p.id)))
            }
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Tag size={15} />
            {t("generateTags", { count: selected.size })}
          </button>
        )}
        {selected.size > 1 && hasMarketData && (
          <button
            onClick={handleBatchMatchMarket}
            disabled={isBatchPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {isBatchPending ? "Matching…" : `Batch match market (${selected.size})`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="ps-4 pe-2 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3 text-right" dir="rtl">
                {t("columns.productName")}
              </th>
              <th className="px-4 py-3 text-start">{t("columns.name")}</th>
              <th className="px-4 py-3 text-start">{t("columns.barcode")}</th>
              <th className="px-4 py-3 text-end">{t("columns.price")}</th>
              {hasMarketData && (
                <th className="px-4 py-3 text-start">
                  {t("columns.marketComparison")}
                  <span className="ms-1 text-slate-400 normal-case font-normal">
                    {t("columns.marketSubtitle")}
                  </span>
                </th>
              )}
              <th className="px-4 py-3 text-center">{t("columns.status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-12 text-center text-slate-400">
                  {t("noProducts")}
                </td>
              </tr>
            ) : (
              filtered.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  comparison={marketData?.[product.id]}
                  isSelected={selected.has(product.id)}
                  hasMarketData={hasMarketData}
                  onToggle={toggle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{t("showing", { filtered: filtered.length, total: products.length })}</span>
        {hasMarketData && (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-200 inline-block" />
              {t("priceAboveMarket")}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
