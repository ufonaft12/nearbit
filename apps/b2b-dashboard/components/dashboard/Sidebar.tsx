"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Tag,
  Settings,
  Store,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

interface SidebarProps {
  storeName: string;
}

export default function Sidebar({ storeName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");

  const NAV_ITEMS = [
    { href: "/business/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/business/inventory", label: t("inventory"), icon: Package },
    { href: "/business/price-tags", label: t("priceTags"), icon: Tag },
    { href: "/business/settings", label: t("settings"), icon: Settings },
  ];

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-slate-900 text-white min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center">
            <Store size={16} />
          </div>
          <span className="font-bold text-lg tracking-tight">Nearbit</span>
        </div>
        <p className="mt-1 text-xs text-slate-400 truncate">{storeName}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Language switcher */}
      <div className="border-t border-slate-800">
        <LanguageSwitcher />
      </div>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-slate-800">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut size={18} />
          {t("signOut")}
        </button>
      </div>
    </aside>
  );
}
