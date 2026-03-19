import { createClient } from "@/lib/supabase/server";
import PriceTagPreview from "@/components/price-tags/PriceTagPreview";

export const dynamic = "force-dynamic";

export default async function PriceTagsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
    .eq("owner_id", user!.id)
    .single();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("store_id", store?.id ?? "")
    .eq("is_available", true)
    .order("name_he");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Price Tags</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Preview and export bilingual print-ready price tags
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <PriceTagPreview
          products={products ?? []}
          storeName={store?.name ?? "Nearbit Store"}
        />
      </div>
    </div>
  );
}
