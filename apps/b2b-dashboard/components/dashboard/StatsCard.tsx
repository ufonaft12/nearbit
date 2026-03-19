import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: string;
  deltaPositive?: boolean;
}

export default function StatsCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaPositive,
}: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
      <div className="p-2.5 bg-brand-50 rounded-lg">
        <Icon size={20} className="text-brand-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        {delta && (
          <p
            className={`text-xs mt-1 font-medium ${
              deltaPositive ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {delta}
          </p>
        )}
      </div>
    </div>
  );
}
