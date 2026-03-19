"use client";

import { useState } from "react";
import { Search, Tag, MoreHorizontal } from "lucide-react";
import type { Product } from "@/types/database";

interface ProductsTableProps {
  products: Product[];
  onSelectForTags?: (products: Product[]) => void;
}

export default function ProductsTable({ products, onSelectForTags }: ProductsTableProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = products.filter((p) => {
    const heb = p.name_he ?? p.normalized_name ?? p.raw_name;
    return (
      heb.includes(search) ||
      (p.name_ru ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? "").includes(search)
    );
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search by name or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
            Generate tags ({selected.size})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="pl-4 pr-2 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3 text-right" dir="rtl">שם מוצר</th>
              <th className="px-4 py-3 text-left">Название</th>
              <th className="px-4 py-3 text-left">Barcode</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  No products found.
                </td>
              </tr>
            ) : (
              filtered.map((product) => {
                const displayName =
                  product.name_he ?? product.normalized_name ?? product.raw_name;
                const displayPrice = product.sale_price ?? product.price;

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      selected.has(product.id) ? "bg-brand-50" : ""
                    }`}
                  >
                    <td className="pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggle(product.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td
                      className="px-4 py-3 font-medium text-slate-900 text-right"
                      dir="rtl"
                    >
                      {displayName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {product.name_ru ?? (
                        <span className="text-slate-300 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {product.barcode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {displayPrice !== null ? `₪${displayPrice.toFixed(2)}` : "—"}
                      {product.sale_price !== null && product.price !== null && (
                        <span className="ml-1 text-xs text-slate-400 line-through font-normal">
                          ₪{product.price.toFixed(2)}
                        </span>
                      )}
                    </td>
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
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Showing {filtered.length} of {products.length} products
      </p>
    </div>
  );
}
