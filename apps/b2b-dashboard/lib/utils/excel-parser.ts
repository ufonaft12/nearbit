import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { ProductUploadRow } from "@/types/database";

// Maps common Hebrew/Russian unit strings → valid DB enum values.
// DB CHECK: unit IN ('kg', 'g', 'liter', 'ml', 'pcs', 'pack', 'other')
const UNIT_MAP: Record<string, string> = {
  // Hebrew
  "ק\"ג": "kg", "קג": "kg", "ק.ג": "kg", "ק'ג": "kg",
  "גרם": "g", "גר": "g", "גר'": "g",
  "ליטר": "liter", "ל'": "liter", "ל\"ר": "liter",
  "מ\"ל": "ml", "מל": "ml",
  "יח'": "pcs", "יח\"ם": "pcs", "יחידה": "pcs", "יחידות": "pcs", "יח": "pcs",
  "חבילה": "pack", "חבילות": "pack",
  // Russian
  "кг": "kg", "г": "g", "гр": "g", "грамм": "g",
  "л": "liter", "литр": "liter", "литров": "liter",
  "мл": "ml",
  "шт": "pcs", "штук": "pcs", "шт.": "pcs",
  "упак": "pack", "упаковка": "pack",
  // English aliases
  "kilogram": "kg", "gram": "g", "grams": "g",
  "litre": "liter", "litres": "liter", "liters": "liter",
  "piece": "pcs", "pieces": "pcs", "unit": "pcs", "units": "pcs",
  "package": "pack", "packages": "pack",
};

const VALID_UNITS = new Set(["kg", "g", "liter", "ml", "pcs", "pack", "other"]);

function normalizeUnit(raw: string | undefined): string {
  if (!raw) return "pcs";
  const trimmed = raw.trim();
  if (VALID_UNITS.has(trimmed)) return trimmed;
  return UNIT_MAP[trimmed] ?? UNIT_MAP[trimmed.toLowerCase()] ?? "other";
}

// Flexible column aliases — covers Hebrew, Russian, and English headers.
// Keys must match ProductUploadRow field names (which now use B2C column names).
const COLUMN_MAP: Record<keyof ProductUploadRow, string[]> = {
  name_he:  ["name_he", "name_heb", "שם עברי", "שם", "product_name_heb", "שם מוצר"],
  name_ru:  ["name_ru", "name_rus", "שם רוסי", "название", "product_name_rus"],
  name_en:  ["name_en", "name_eng", "english name", "product_name_eng"],
  barcode:  ["barcode", "ברקוד", "штрихкод"],
  category: ["category", "קטגוריה", "категория"],
  price:    ["price", "current_price", "מחיר", "цена"],
  unit:     ["unit", "יחידה", "единица"],
};

function resolveColumn(
  headers: string[],
  field: keyof ProductUploadRow
): string | undefined {
  const aliases = COLUMN_MAP[field].map((a) => a.toLowerCase());
  return headers.find((h) => aliases.includes(h.toLowerCase()));
}

export interface ParseResult {
  rows: ProductUploadRow[];
  normalizedUnits: number;  // rows where a Hebrew/Russian unit was mapped to a DB enum
  encodingFixed: boolean;   // true when windows-1255 fallback was used for CSV
  parseErrors: string[];    // row-level validation errors (invalid/missing/negative price)
}

function mapRow(
  raw: Record<string, unknown>,
  headers: string[],
  rowNumber: number
): { row: ProductUploadRow | null; unitNormalized: boolean; priceError: string | null } {
  const get = (field: keyof ProductUploadRow) => {
    const col = resolveColumn(headers, field);
    return col ? raw[col] : undefined;
  };

  const name_he = String(get("name_he") ?? "").trim();
  // Empty name → likely a trailing blank row; skip silently (no error reported)
  if (!name_he) return { row: null, unitNormalized: false, priceError: null };

  // Strict price validation — Israeli formatting: strip ₪ symbol and thousands commas
  const rawPriceStr = String(get("price") ?? "").trim();
  if (!rawPriceStr) {
    return { row: null, unitNormalized: false, priceError: `Row ${rowNumber}: Price is required` };
  }
  const cleaned = rawPriceStr.replace(/[₪$€£¥,\s]/g, ""); // keep digits, dot, minus sign
  const price = parseFloat(cleaned);
  if (isNaN(price)) {
    return { row: null, unitNormalized: false, priceError: `Row ${rowNumber}: Invalid price '${rawPriceStr}'` };
  }
  if (price < 0) {
    return { row: null, unitNormalized: false, priceError: `Row ${rowNumber}: Price must be positive (got ${rawPriceStr})` };
  }

  const rawUnit = String(get("unit") ?? "").trim() || undefined;
  // A unit was "normalized" only when the file had a non-empty, non-standard value
  // that we successfully mapped (e.g. "יח'" → "pcs"). Defaulting undefined → "pcs" is not counted.
  const unitNormalized = !!rawUnit && !VALID_UNITS.has(rawUnit);

  return {
    row: {
      name_he,
      name_ru: String(get("name_ru") ?? "").trim() || undefined,
      name_en: String(get("name_en") ?? "").trim() || undefined,
      barcode:  String(get("barcode")  ?? "").trim() || undefined,
      category: String(get("category") ?? "").trim() || undefined,
      price,
      unit: normalizeUnit(rawUnit),
    },
    unitNormalized,
    priceError: null,
  };
}

export async function parseUploadedFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  if (isExcel) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, col) => {
      headers[col - 1] = String(cell.value ?? "");
    });

    let normalizedUnits = 0;
    const rows: ProductUploadRow[] = [];
    const parseErrors: string[] = [];

    worksheet.eachRow((excelRow, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const raw: Record<string, unknown> = {};
      excelRow.eachCell((cell, col) => { raw[headers[col - 1]] = cell.value; });
      const { row, unitNormalized, priceError } = mapRow(raw, headers, rowNumber);
      if (priceError) parseErrors.push(priceError);
      if (row) {
        if (unitNormalized) normalizedUnits++;
        rows.push(row);
      }
    });

    return { rows, normalizedUnits, encodingFixed: false, parseErrors };
  }

  // CSV path — try UTF-8 first; if Hebrew chars are garbled, retry with Windows-1255
  // (most Israeli POS software exports CSV in Windows-1255 / cp1255)
  let text = new TextDecoder("utf-8").decode(bytes);
  let encodingFixed = false;
  // Heuristic: if we see replacement chars (U+FFFD) but no Hebrew Unicode range,
  // the file is likely Windows-1255 encoded
  const hasReplacement = text.includes("\uFFFD");
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (hasReplacement && !hasHebrew) {
    try {
      text = new TextDecoder("windows-1255").decode(bytes);
      encodingFixed = true;
    } catch {
      // windows-1255 not supported in this environment — keep UTF-8 decode
    }
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const csvHeaders = parsed.meta.fields ?? [];
  let normalizedUnits = 0;
  const rows: ProductUploadRow[] = [];
  const parseErrors: string[] = [];

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 because row 1 is the header
    const { row, unitNormalized, priceError } = mapRow(raw, csvHeaders, rowNumber);
    if (priceError) parseErrors.push(priceError);
    if (row) {
      if (unitNormalized) normalizedUnits++;
      rows.push(row);
    }
  });

  return { rows, normalizedUnits, encodingFixed, parseErrors };
}
