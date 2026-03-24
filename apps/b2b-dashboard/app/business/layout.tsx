import { redirect } from "next/navigation";
import { getStore } from "@/lib/supabase/queries";
import Sidebar from "@/components/dashboard/Sidebar";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await getStore();
  if (!store) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar storeName={store?.name ?? "My Store"} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
