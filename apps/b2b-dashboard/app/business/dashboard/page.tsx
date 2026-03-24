import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/supabase/queries";
import StatsCard from "@/components/dashboard/StatsCard";
import { Package, Tag, TrendingDown, TrendingUp } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const store = await getStore();
  const storeId = store?.id ?? "";

  type HistoryRow = {
    new_price: number;
    old_price: number | null;
    recorded_at: string;
    products: { name_he: string | null; normalized_name: string | null; raw_name: string } | null;
  };

  const [{ count: totalProducts }, { count: priceChanges }, { data: recentHistory }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId),
      supabase
        .from("price_history")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .gte("recorded_at", new Date(Date.now() - 7 * 864e5).toISOString()),
      supabase
        .from("price_history")
        .select("new_price, old_price, recorded_at, products(name_he, normalized_name, raw_name)")
        .eq("store_id", storeId)
        .order("recorded_at", { ascending: false })
        .limit(5),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {store?.name_heb ?? store?.name ?? "Dashboard"}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {store?.city ? `${store.city} · ` : ""}Overview of your store
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard label="Total Products" value={totalProducts ?? 0} icon={Package} />
        <StatsCard
          label="Price Changes (7d)"
          value={priceChanges ?? 0}
          icon={TrendingDown}
          delta={priceChanges ? `${priceChanges} updates this week` : undefined}
          deltaPositive={false}
        />
        <StatsCard label="Active Tags" value="—" icon={Tag} delta="Generate from Inventory" />
        <StatsCard label="Price Trend" value="—" icon={TrendingUp} delta="Connect analytics" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Recent Price Changes</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {(recentHistory ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-400">
              No price changes recorded yet.
            </p>
          ) : (
            (recentHistory as HistoryRow[] ?? []).map((h) => {
              const diff = h.new_price - (h.old_price ?? h.new_price);
              const up = diff > 0;
              const productName = h.products?.name_he ?? h.products?.normalized_name ?? h.products?.raw_name ?? "—";

              return (
                <div
                  key={h.recorded_at}
                  className="px-5 py-3 flex items-center justify-between text-sm"
                >
                  <span className="text-slate-700 font-medium" dir="rtl">
                    {productName}
                  </span>
                  <div className="flex items-center gap-3">
                    {h.old_price && (
                      <span className="text-slate-400 line-through">
                        ₪{h.old_price.toFixed(2)}
                      </span>
                    )}
                    <span className={`font-semibold ${up ? "text-red-600" : "text-emerald-600"}`}>
                      ₪{h.new_price.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(h.recorded_at).toLocaleDateString("en-IL")}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
