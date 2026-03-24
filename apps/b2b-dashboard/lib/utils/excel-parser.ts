import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { ProductUploadRow } from "@/types/database";

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
    unit: String(get("unit") ?? "").trim() || undefined,
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

  // CSV path
  const text = new TextDecoder("utf-8").decode(bytes);
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
