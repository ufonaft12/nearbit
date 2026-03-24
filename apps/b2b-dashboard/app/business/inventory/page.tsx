import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/supabase/queries";
import ProductsTable from "@/components/inventory/ProductsTable";
import { Upload } from "lucide-react";

// Columns actually used in the UI — excludes embedding (1536 floats) and raw POS fields
const PRODUCT_COLUMNS =
  "id, store_id, name_he, name_ru, name_en, normalized_name, category, category_id, price, sale_price, sale_until, barcode, unit, quantity, is_available, image_url, created_at";

export default async function InventoryPage() {
  const supabase = await createClient();
  const store = await getStore();

  const products = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("store_id", store?.id ?? "")
    .order("name_he")
    .then((r) => r.data ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your product catalog
          </p>
        </div>
        <Link
          href="/business/inventory/upload"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Upload size={16} />
          Upload Inventory
        </Link>
      </div>

      <ProductsTable products={products} />
    </div>
  );
}
