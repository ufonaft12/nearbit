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

function mapRow(
  raw: Record<string, unknown>,
  headers: string[]
): ProductUploadRow | null {
  const get = (field: keyof ProductUploadRow) => {
    const col = resolveColumn(headers, field);
    return col ? raw[col] : undefined;
  };

  const name_he = String(get("name_he") ?? "").trim();
  if (!name_he) return null; // required

  const rawPrice = get("price");
  const price = parseFloat(String(rawPrice).replace(/[^\d.]/g, ""));
  if (isNaN(price)) return null;

  return {
    name_he,
    name_ru: String(get("name_ru") ?? "").trim() || undefined,
    name_en: String(get("name_en") ?? "").trim() || undefined,
    barcode:  String(get("barcode")  ?? "").trim() || undefined,
    category: String(get("category") ?? "").trim() || undefined,
    price,
    unit: normalizeUnit(String(get("unit") ?? "").trim() || undefined),
  };
}

export async function parseUploadedFile(file: File): Promise<ProductUploadRow[]> {
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

    const rows: Record<string, unknown>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      row.eachCell((cell, col) => {
        obj[headers[col - 1]] = cell.value;
      });
      rows.push(obj);
    });

    return rows.flatMap((row) => {
      const mapped = mapRow(row, headers);
      return mapped ? [mapped] : [];
    });
  }

  // CSV path — try UTF-8 first; if Hebrew chars are garbled, retry with Windows-1255
  // (most Israeli POS software exports CSV in Windows-1255 / cp1255)
  let text = new TextDecoder("utf-8").decode(bytes);
  // Heuristic: if we see replacement chars (U+FFFD) but no Hebrew Unicode range,
  // the file is likely Windows-1255 encoded
  const hasReplacement = text.includes("\uFFFD");
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (hasReplacement && !hasHebrew) {
    try {
      text = new TextDecoder("windows-1255").decode(bytes);
    } catch {
      // windows-1255 not supported in this environment — keep UTF-8 decode
    }
  }
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  return parsed.data.flatMap((row) => {
    const mapped = mapRow(row, headers);
    return mapped ? [mapped] : [];
  });
}
