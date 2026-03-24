"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ClipboardCopy,
  ClipboardCheck,
  Download,
  RotateCcw,
  ArrowLeft,
  Info,
  Wand2,
} from "lucide-react";
import type { UploadResult } from "@/lib/actions/inventory";

interface UploadResultsProps {
  result: UploadResult;
  fileName: string;
  onReset: () => void;
}

type AlertVariant = "success" | "warning" | "error";

function getVariant(result: UploadResult): AlertVariant {
  if (result.inserted === 0 && result.errors.length > 0) return "error";
  if (result.errors.length > 0 || result.skipped > 0) return "warning";
  return "success";
}

const VARIANT_STYLES: Record<AlertVariant, { border: string; bg: string; icon: React.ReactNode; label: string }> = {
  success: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    icon: <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />,
    label: "Upload successful",
  },
  warning: {
    border: "border-yellow-200",
    bg: "bg-yellow-50",
    icon: <AlertTriangle size={20} className="text-yellow-600 shrink-0" />,
    label: "Upload completed with warnings",
  },
  error: {
    border: "border-red-200",
    bg: "bg-red-50",
    icon: <XCircle size={20} className="text-red-600 shrink-0" />,
    label: "Upload failed",
  },
};

export default function UploadResults({ result, fileName, onReset }: UploadResultsProps) {
  const [copied, setCopied] = useState(false);

  const variant = getVariant(result);
  const styles = VARIANT_STYLES[variant];

  const handleCopyErrors = async () => {
    await navigator.clipboard.writeText(result.errors.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadErrorLog = () => {
    const rows = [
      ["#", "Error"],
      ...result.errors.map((msg, i) => [String(i + 1), `"${msg.replace(/"/g, '""')}"`]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upload-errors-${fileName.replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Main alert */}
      <div className={`rounded-xl border p-4 ${styles.border} ${styles.bg}`}>
        <div className="flex items-center gap-2 mb-3">
          {styles.icon}
          <span className="font-semibold text-slate-800">{styles.label}</span>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-3 text-sm">
          <StatPill
            value={result.inserted}
            label={result.inserted === 1 ? "product upserted" : "products upserted"}
            color="emerald"
          />
          {result.skipped > 0 && (
            <StatPill
              value={result.skipped}
              label={result.skipped === 1 ? "row skipped" : "rows skipped"}
              color="slate"
            />
          )}
          {result.errors.length > 0 && (
            <StatPill
              value={result.errors.length}
              label={result.errors.length === 1 ? "error" : "errors"}
              color="red"
            />
          )}
        </div>
      </div>

      {/* Smart details */}
      {(result.normalizedUnits > 0 || result.encodingFixed) && (
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide flex items-center gap-1.5">
            <Wand2 size={12} />
            Auto-corrections applied
          </p>
          {result.normalizedUnits > 0 && (
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Info size={14} className="text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong>{result.normalizedUnits}</strong>{" "}
                {result.normalizedUnits === 1 ? "item was" : "items were"} automatically mapped to
                standard units (e.g. <code className="text-xs bg-white px-1 rounded border border-slate-200">יח&apos;</code> →{" "}
                <code className="text-xs bg-white px-1 rounded border border-slate-200">pcs</code>,{" "}
                <code className="text-xs bg-white px-1 rounded border border-slate-200">ק&quot;ג</code> →{" "}
                <code className="text-xs bg-white px-1 rounded border border-slate-200">kg</code>).
              </span>
            </div>
          )}
          {result.encodingFixed && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Info size={14} className="text-brand-500 shrink-0" />
              <span>
                Hebrew encoding corrected automatically — file was re-decoded from{" "}
                <code className="text-xs bg-white px-1 rounded border border-slate-200">Windows-1255</code> to UTF-8.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error list */}
      {result.errors.length > 0 && (
        <div className="rounded-xl border border-red-100 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-red-100 bg-red-50">
            <span className="text-sm font-medium text-red-700">
              {result.errors.length} {result.errors.length === 1 ? "error" : "errors"}
            </span>
            <button
              onClick={handleCopyErrors}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              {copied ? (
                <>
                  <ClipboardCheck size={13} className="text-emerald-600" />
                  <span className="text-emerald-600">Copied</span>
                </>
              ) : (
                <>
                  <ClipboardCopy size={13} />
                  Copy all
                </>
              )}
            </button>
          </div>
          <ul
            className="divide-y divide-red-50 max-h-48 overflow-y-auto text-sm"
            dir="auto"
          >
            {result.errors.map((err, i) => (
              <li key={i} className="px-4 py-2 text-red-600 font-mono text-xs leading-relaxed">
                <span className="text-slate-400 select-none mr-2">{i + 1}.</span>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/business/inventory"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <ArrowLeft size={15} />
          Go to Inventory
        </Link>

        {result.errors.length > 0 && (
          <button
            onClick={handleDownloadErrorLog}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            <Download size={15} />
            Download Error Log
          </button>
        )}

        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
        >
          <RotateCcw size={15} />
          Upload Another File
        </button>
      </div>
    </div>
  );
}

function StatPill({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: "emerald" | "slate" | "red";
}) {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-800",
    slate: "bg-slate-100 text-slate-600",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      <strong>{value}</strong> {label}
    </span>
  );
}
