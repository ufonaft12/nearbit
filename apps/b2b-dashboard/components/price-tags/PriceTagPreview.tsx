"use client";

import { useState } from "react";
import { Download, Tag, AlertCircle } from "lucide-react";
import { generatePriceTagPDF, downloadPDF } from "@/lib/utils/price-tag-pdf";
import type { Product } from "@/types/database";

interface PriceTagPreviewProps {
  products: Product[];
  storeName: string;
}

function SingleTag({ product }: { product: Product }) {
  const displayPrice = product.sale_price ?? product.price;
  const hasSale = product.sale_price !== null;

  return (
    <div className="relative w-[220px] h-[140px] border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col p-3 select-none">
      {/* Sale badge */}
      {hasSale && product.price !== null && (
        <span className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
          מבצע ₪{product.price.toFixed(2)}
        </span>
      )}

      {/* Price */}
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-3xl font-black text-slate-900 leading-none">
          {displayPrice !== null ? displayPrice.toFixed(2) : "—"}
        </span>
        <span className="text-base font-semibold text-slate-600">₪</span>
      </div>

      {/* Hebrew name — RTL (B2C `name_he` column) */}
      <p
        dir="rtl"
        className="mt-2 text-sm font-semibold text-slate-800 truncate text-right"
      >
        {product.name_he ?? product.normalized_name ?? product.raw_name}
      </p>

      {/* Russian name (B2C `name_ru` column) */}
      {product.name_ru && (
        <p className="text-[11px] text-slate-500 truncate">{product.name_ru}</p>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between">
        {/* QR placeholder */}
        <div className="w-8 h-8 border border-dashed border-slate-300 rounded flex items-center justify-center">
          <Tag size={14} className="text-slate-300" />
        </div>
        <span className="text-[9px] text-slate-400 truncate max-w-[130px] text-right">
          {product.barcode ?? product.id.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}

export default function PriceTagPreview({
  products,
  storeName,
}: PriceTagPreviewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleProduct = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  const handleExportPDF = async () => {
    const toExport =
      selected.size > 0
        ? products.filter((p) => selected.has(p.id))
        : products;

    if (toExport.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const blob = await generatePriceTagPDF({ products: toExport, storeName });
      downloadPDF(blob, `price-tags-${Date.now()}.pdf`);
    } catch (err) {
      setError("PDF generation failed. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Tag size={40} className="mb-3" />
        <p className="text-sm">No products to preview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === products.length}
              onChange={toggleAll}
              className="rounded border-slate-300"
            />
            Select all ({products.length})
          </label>
          {selected.size > 0 && (
            <span className="text-xs text-brand-600 font-medium">
              {selected.size} selected
            </span>
          )}
        </div>

        <button
          onClick={handleExportPDF}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          {loading
            ? "Generating PDF…"
            : selected.size > 0
            ? `Export ${selected.size} tag${selected.size > 1 ? "s" : ""}`
            : "Export all as PDF"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tag grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => toggleProduct(product.id)}
            className={`text-left transition-all rounded-lg ${
              selected.has(product.id)
                ? "ring-2 ring-brand-500 ring-offset-2"
                : "hover:ring-1 hover:ring-slate-300"
            }`}
          >
            <SingleTag product={product} />
          </button>
        ))}
      </div>
    </div>
  );
}
