import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductsTable from "@/components/inventory/ProductsTable";
import { Upload } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user!.id)
    .single();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("store_id", store?.id ?? "")
    .order("name_he");

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

      <ProductsTable products={products ?? []} />
    </div>
  );
}
