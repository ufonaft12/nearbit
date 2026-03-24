import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/supabase/queries";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const store = await getStore();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage your store profile
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {/* Store info */}
        <div className="px-6 py-5">
          <h2 className="font-semibold text-slate-900 mb-4">Store Information</h2>
          <dl className="space-y-3 text-sm">
            {[
              ["Store Name (English)", store?.name],
              ["Store Name (Hebrew)", store?.name_heb],
              ["City", store?.city],
              ["Address", store?.address],
              ["Chain", store?.chain],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-4">
                <dt className="w-44 text-slate-500 shrink-0">{label}</dt>
                <dd className="text-slate-900 font-medium">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Account */}
        <div className="px-6 py-5">
          <h2 className="font-semibold text-slate-900 mb-4">Account</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex gap-4">
              <dt className="w-44 text-slate-500 shrink-0">Email</dt>
              <dd className="text-slate-900 font-medium">{user?.email}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-44 text-slate-500 shrink-0">Store ID</dt>
              <dd className="text-slate-900 font-mono text-xs">{store?.id}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Edit form placeholder */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4 text-sm text-amber-800">
        Store editing form coming soon. Contact support to update store details.
      </div>
    </div>
  );
}
