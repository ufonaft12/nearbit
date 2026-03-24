"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, Circle } from "lucide-react";
import { uploadInventoryAction } from "@/lib/actions/inventory";
import type { UploadResult } from "@/lib/actions/inventory";
import UploadResults from "./UploadResults";

type UploadStatus = "idle" | "reading" | "saving";

const STATUS_STEPS: { key: UploadStatus; label: string }[] = [
  { key: "reading", label: "Reading & validating file…" },
  { key: "saving",  label: "Saving to database…" },
];

const EMPTY_RESULT = {
  inserted: 0, skipped: 0,
  normalizedUnits: 0, encodingFixed: false,
  priceIncreased: 0, priceDecreased: 0,
};

export default function UploadForm() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile]             = useState<File | null>(null);
  const [fileName, setFileName]     = useState("");
  const [result, setResult]         = useState<UploadResult | null>(null);
  const [status, setStatus]         = useState<UploadStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFile(null);
    setFileName("");
    setResult(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = (f: File) => {
    const allowed = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(f.type) && !f.name.match(/\.(csv|xlsx|xls)$/i)) {
      setResult({ ...EMPTY_RESULT, errors: ["Please upload a CSV or Excel file."] });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setResult({ ...EMPTY_RESULT, errors: ["File exceeds 10 MB limit."] });
      return;
    }
    setFile(f);
    setFileName(f.name);
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

    // Step 1 — client-side: parse + validate
    setStatus("reading");
    let parsed: import("@/lib/utils/excel-parser").ParseResult;
    try {
      // Lazy-load so ExcelJS/PapaParse are only bundled when actually needed
      const { parseUploadedFile } = await import("@/lib/utils/excel-parser");
      parsed = await parseUploadedFile(file);
    } catch (err) {
      setResult({ ...EMPTY_RESULT, errors: [`File parse error: ${String(err)}`] });
      setStatus("idle");
      return;
    }

    // If every row failed validation, surface errors without hitting the server
    if (parsed.rows.length === 0) {
      setResult({
        ...EMPTY_RESULT,
        errors: parsed.parseErrors.length
          ? parsed.parseErrors
          : ["File contained no valid rows."],
        normalizedUnits: parsed.normalizedUnits,
        encodingFixed: parsed.encodingFixed,
      });
      setStatus("idle");
      return;
    }

    // Step 2 — server: smart mapping + DB upsert + price analytics
    setStatus("saving");
    try {
      const serverResult = await uploadInventoryAction({
        rows: parsed.rows,
        normalizedUnits: parsed.normalizedUnits,
        encodingFixed: parsed.encodingFixed,
      });
      // Merge client-side parse errors with any DB errors from the server
      setResult({
        ...serverResult,
        errors: [...parsed.parseErrors, ...serverResult.errors],
      });
    } catch (err) {
      setResult({
        ...EMPTY_RESULT,
        errors: [...parsed.parseErrors, String(err)],
        normalizedUnits: parsed.normalizedUnits,
        encodingFixed: parsed.encodingFixed,
      });
    }
    setStatus("idle");
  };

  // After upload completes, replace the entire form with the results view
  if (result) {
    return <UploadResults result={result} fileName={fileName} onReset={resetForm} />;
  }

  const isUploading = status !== "idle";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 transition-colors ${
          isUploading
            ? "border-brand-200 bg-brand-50 cursor-default"
            : isDragging
            ? "border-brand-500 bg-brand-50 cursor-pointer"
            : file
            ? "border-emerald-400 bg-emerald-50 cursor-pointer"
            : "border-slate-200 hover:border-brand-300 hover:bg-slate-50 cursor-pointer"
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
            <FileSpreadsheet size={36} className={isUploading ? "text-brand-400" : "text-emerald-500"} />
            <div className="text-center">
              <p className="font-medium text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB
                {!isUploading && " — click to change"}
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload size={36} className="text-slate-400" />
            <div className="text-center">
              <p className="font-medium text-slate-700">Drop your CSV or Excel file here</p>
              <p className="text-sm text-slate-400 mt-0.5">Supports .csv, .xlsx, .xls — up to 10 MB</p>
            </div>
          </>
        )}
      </div>

      {/* Progress steps — shown only while uploading */}
      {isUploading ? (
        <div className="space-y-3">
          {/* Indeterminate progress bar */}
          <div className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="absolute h-full w-2/5 bg-brand-500 rounded-full"
              style={{ animation: "upload-slide 1.4s ease-in-out infinite" }}
            />
            <style>{`
              @keyframes upload-slide {
                0%   { transform: translateX(-200%); }
                100% { transform: translateX(350%); }
              }
            `}</style>
          </div>

          {/* Step list */}
          <ol className="space-y-1.5">
            {STATUS_STEPS.map((step, i) => {
              const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);
              const done    = i < currentIdx;
              const active  = i === currentIdx;
              return (
                <li key={step.key} className="flex items-center gap-2 text-sm">
                  {done ? (
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                  ) : active ? (
                    <span className="h-[15px] w-[15px] rounded-full border-2 border-brand-500 border-t-transparent animate-spin shrink-0 block" />
                  ) : (
                    <Circle size={15} className="text-slate-300 shrink-0" />
                  )}
                  <span className={active ? "text-slate-800 font-medium" : done ? "text-emerald-700" : "text-slate-400"}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <>
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
            disabled={!file}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={18} />
            Upload Inventory
          </button>
        </>
      )}
    </form>
  );
}
