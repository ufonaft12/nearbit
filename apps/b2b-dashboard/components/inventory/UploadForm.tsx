"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { uploadInventoryAction } from "@/lib/actions/inventory";
import type { UploadResult } from "@/lib/actions/inventory";

export default function UploadForm() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const allowed = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(f.type) && !f.name.match(/\.(csv|xlsx|xls)$/i)) {
      setResult({ inserted: 0, skipped: 0, errors: ["Please upload a CSV or Excel file."] });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setResult({ inserted: 0, skipped: 0, errors: ["File exceeds 10 MB limit."] });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await uploadInventoryAction(formData);
      setResult(res);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
          isDragging
            ? "border-brand-500 bg-brand-50"
            : file
            ? "border-emerald-400 bg-emerald-50"
            : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {file ? (
          <>
            <FileSpreadsheet size={36} className="text-emerald-500" />
            <div className="text-center">
              <p className="font-medium text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB — click to change
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload size={36} className="text-slate-400" />
            <div className="text-center">
              <p className="font-medium text-slate-700">
                Drop your CSV or Excel file here
              </p>
              <p className="text-sm text-slate-400 mt-0.5">
                Supports .csv, .xlsx, .xls — up to 10 MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Smart mapping note */}
      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <span className="text-brand-500 font-bold mt-0.5">AI</span>
        <span>
          <strong className="text-slate-600">Smart Mapping</strong> will
          automatically categorize your products using AI. You can review and
          correct categories after upload.
        </span>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!file || isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Upload size={18} />
            Upload Inventory
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border p-4 space-y-1 text-sm ${
            result.errors.length > 0
              ? "bg-yellow-50 border-yellow-200"
              : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2 font-medium text-slate-700">
            {result.errors.length === 0 ? (
              <CheckCircle size={16} className="text-emerald-600" />
            ) : (
              <XCircle size={16} className="text-yellow-600" />
            )}
            Upload complete
          </div>
          <p className="text-slate-600">
            {result.inserted} product{result.inserted !== 1 ? "s" : ""} imported
            {result.skipped > 0 && `, ${result.skipped} skipped`}.
          </p>
          {result.errors.map((err, i) => (
            <p key={i} className="text-red-600 text-xs">
              {err}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}
