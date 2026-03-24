import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import UploadForm from "@/components/inventory/UploadForm";

export default function InventoryUploadPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/business/inventory"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft size={15} />
          Back to Inventory
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Upload Inventory</h1>
        <p className="text-sm text-slate-500 mt-1">
          Import products from a CSV or Excel file. Required columns:{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">name_he</code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">price</code>
          . Optional:{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">name_ru</code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">barcode</code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">category</code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">unit</code>.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <UploadForm />
      </div>
    </div>
  );
}
