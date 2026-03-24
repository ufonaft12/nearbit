import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/supabase/queries";
import ProductsTable from "@/components/inventory/ProductsTable";
import { Upload } from "lucide-react";

const PRODUCT_COLUMNS =
  "id, store_id, name_he, name_ru, name_en, normalized_name, category, category_id, price, sale_price, sale_until, barcode, unit, quantity, is_available, image_url, created_at";

async function ProductsList({ storeId }: { storeId: string }) {
  const supabase = await createClient();
  const products = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("store_id", storeId)
    .order("name_he")
    .then((r) => r.data ?? []);
  return <ProductsTable products={products} />;
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 animate-pulse">
      <div className="h-12 border-b border-slate-100 px-4 flex items-center gap-3">
        <div className="h-8 w-64 bg-slate-100 rounded-lg" />
        <div className="h-8 w-32 bg-slate-100 rounded-lg" />
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-14 border-b border-slate-50 px-4 flex items-center gap-4">
          <div className="h-4 w-48 bg-slate-100 rounded" />
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-16 bg-slate-100 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

export default async function InventoryPage() {
  const store = await getStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your product catalog</p>
        </div>
        <Link
          href="/business/inventory/upload"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Upload size={16} />
          Upload Inventory
        </Link>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <ProductsList storeId={store?.id ?? ""} />
      </Suspense>
    </div>
  );
}
