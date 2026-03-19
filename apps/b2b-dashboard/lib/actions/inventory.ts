"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseUploadedFile } from "@/lib/utils/excel-parser";
import { withTrace } from "@/lib/langfuse/client";
import type { ProductUploadRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Deterministic pos_item_id for B2B manual uploads.
// B2C uses this as the unique key per store — we must populate it.
// ---------------------------------------------------------------------------
function derivePosItemId(row: ProductUploadRow): string {
  if (row.barcode) return row.barcode;
  // Slug from Hebrew name: strip non-alphanumeric, lowercase
  const slug = row.name_he
    .replace(/[^\w\u0590-\u05FF]/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `b2b:${slug}`;
}

// ---------------------------------------------------------------------------
// Smart Mapping placeholder
// Replace this body with a real LangChain pipeline when ready.
// ---------------------------------------------------------------------------
async function smartMapCategories(
  rows: ProductUploadRow[],
  span: ReturnType<import("langfuse").Langfuse["trace"]>
): Promise<ProductUploadRow[]> {
  const generation = span.generation({
    name: "smart-category-mapping",
    model: "gpt-4o-mini",
    input: rows.map((r) => ({ name_he: r.name_he, category: r.category })),
  });

  // TODO: Replace with actual LangChain chain:
  //
  // const { ChatOpenAI } = await import("@langchain/openai");
  // const { PromptTemplate } = await import("@langchain/core/prompts");
  // const model = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
  // const prompt = PromptTemplate.fromTemplate(`
  //   You are a grocery categorization assistant for an Israeli supermarket.
  //   Product name (Hebrew): {name_he}
  //   Raw category hint: {raw_category}
  //   Return one of: Fruits & Vegetables, Dairy, Meat & Poultry, Bread & Bakery,
  //   Beverages, Canned Goods, Snacks & Sweets, Cleaning, Personal Care, Frozen, Other
  // `);
  // const chain = prompt.pipe(model);

  // Placeholder: pass-through unchanged
  generation.end({ output: rows.map((r) => r.category) });
  return rows;
}

// ---------------------------------------------------------------------------
// Main Server Action
// ---------------------------------------------------------------------------
export interface UploadResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function uploadInventoryAction(
  formData: FormData
): Promise<UploadResult> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { inserted: 0, skipped: 0, errors: ["No file provided."] };
  }

  return withTrace(
    "inventory-upload",
    async (trace) => {
      trace.update({
        input: { fileName: file.name, fileSize: file.size },
        metadata: { source: "b2b_csv" },
      });

      // 1. Parse file
      const parseSpan = trace.span({ name: "parse-file" });
      let rows: ProductUploadRow[];
      try {
        rows = await parseUploadedFile(file);
        parseSpan.end({ output: { rowCount: rows.length } });
      } catch (err) {
        parseSpan.end({ output: { error: String(err) } });
        return {
          inserted: 0,
          skipped: 0,
          errors: [`File parse error: ${String(err)}`],
        };
      }

      if (rows.length === 0) {
        return { inserted: 0, skipped: 0, errors: ["File contained no valid rows."] };
      }

      // 2. Smart category mapping (LangChain placeholder)
      const mappingSpan = trace.span({ name: "smart-mapping" });
      const mappedRows = await smartMapCategories(rows, trace);
      mappingSpan.end({ output: { rowCount: mappedRows.length } });

      // 3. Write to Supabase
      const dbSpan = trace.span({ name: "db-upsert" });
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("owner_id", user.id)
        .single();
      if (!store) throw new Error("No store found for this user.");

      // Resolve category text → category_id
      const { data: categories } = await supabase
        .from("categories")
        .select("id, name_en");
      const categoryIndex = new Map(
        (categories ?? []).map((c) => [c.name_en.toLowerCase(), c.id])
      );

      const errors: string[] = [];
      let inserted = 0;
      let skipped = 0;

      // Batch upsert in chunks of 100
      const CHUNK = 100;
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const chunk = mappedRows.slice(i, i + CHUNK).map((row) => ({
          store_id:     store.id,
          pos_item_id:  derivePosItemId(row),   // required NOT NULL in B2C schema
          raw_name:     row.name_he,             // required NOT NULL in B2C schema
          name_he:      row.name_he,
          name_ru:      row.name_ru ?? null,
          name_en:      row.name_en ?? null,
          barcode:      row.barcode ?? null,
          category:     row.category ?? null,    // free-text (B2C column)
          category_id:  row.category
            ? (categoryIndex.get(row.category.toLowerCase()) ?? null)
            : null,
          price:        row.price,
          unit:         row.unit ?? "pcs",
        }));

        const { error, count } = await supabase
          .from("products")
          .upsert(chunk, {
            onConflict: "store_id,pos_item_id",
            count: "exact",
          });

        if (error) {
          errors.push(`Batch ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
          skipped += chunk.length;
        } else {
          inserted += count ?? chunk.length;
        }
      }

      dbSpan.end({ output: { inserted, skipped, errors } });
      revalidatePath("/business/inventory");

      return { inserted, skipped, errors };
    },
    { fileName: file.name }
  );
}
