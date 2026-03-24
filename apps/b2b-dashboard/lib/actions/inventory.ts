"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
// parseUploadedFile runs client-side — not imported here
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
// Types
// ---------------------------------------------------------------------------

// Payload sent from the client after client-side parsing
export interface UploadPayload {
  rows: ProductUploadRow[];
  normalizedUnits: number;
  encodingFixed: boolean;
}

export interface UploadResult {
  inserted: number;
  skipped: number;
  errors: string[];
  normalizedUnits: number;
  encodingFixed: boolean;
  priceIncreased: number;  // existing products whose price went up
  priceDecreased: number;  // existing products whose price went down
}

// ---------------------------------------------------------------------------
// Main Server Action
// Parsing is done client-side. This action receives pre-parsed rows.
// ---------------------------------------------------------------------------
export async function uploadInventoryAction(
  payload: UploadPayload
): Promise<UploadResult> {
  const base = {
    normalizedUnits: payload.normalizedUnits,
    encodingFixed: payload.encodingFixed,
    priceIncreased: 0,
    priceDecreased: 0,
  };

  if (!payload.rows.length) {
    return { inserted: 0, skipped: 0, errors: ["No rows to import."], ...base };
  }

  return withTrace(
    "inventory-upload",
    async (trace) => {
      trace.update({
        input: { rowCount: payload.rows.length },
        metadata: { source: "b2b_csv", normalizedUnits: payload.normalizedUnits },
      });

      // 1. Smart category mapping (LangChain placeholder)
      const mappingSpan = trace.span({ name: "smart-mapping" });
      const mappedRows = await smartMapCategories(payload.rows, trace);
      mappingSpan.end({ output: { rowCount: mappedRows.length } });

      // 2. Authenticate + load store
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("owner_id", user.id)
        .single();
      if (!store) throw new Error("No store found for this user.");

      // 3. Resolve category text → category_id
      const { data: categories } = await supabase
        .from("categories")
        .select("id, name_en");
      const categoryIndex = new Map(
        (categories ?? []).map((c) => [c.name_en.toLowerCase(), c.id])
      );

      // 4. Price analytics — single SELECT for ALL pos_item_ids before the upsert.
      //    Avoids N+1: one round-trip regardless of file size.
      //    Chunked at 500 to stay within URL length limits for Hebrew slugs.
      const incomingPrices = new Map<string, number>();
      for (const row of mappedRows) {
        incomingPrices.set(derivePosItemId(row), row.price);
      }

      const allIds = [...incomingPrices.keys()];
      const oldPrices = new Map<string, number | null>();
      const PRICE_CHUNK = 500;
      for (let i = 0; i < allIds.length; i += PRICE_CHUNK) {
        const { data: existing } = await supabase
          .from("products")
          .select("pos_item_id, price")
          .eq("store_id", store.id)
          .in("pos_item_id", allIds.slice(i, i + PRICE_CHUNK));
        for (const r of existing ?? []) {
          oldPrices.set(r.pos_item_id, r.price as number | null);
        }
      }

      // 5. Batch upsert in chunks of 100
      const dbSpan = trace.span({ name: "db-upsert" });
      const errors: string[] = [];
      let inserted = 0;
      let skipped = 0;

      const CHUNK = 100;
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const chunk = mappedRows.slice(i, i + CHUNK).map((row) => ({
          store_id:    store.id,
          pos_item_id: derivePosItemId(row),
          raw_name:    row.name_he,
          name_he:     row.name_he,
          name_ru:     row.name_ru ?? null,
          name_en:     row.name_en ?? null,
          barcode:     row.barcode ?? null,
          category:    row.category ?? null,
          category_id: row.category
            ? (categoryIndex.get(row.category.toLowerCase()) ?? null)
            : null,
          price:       row.price,
          unit:        row.unit ?? "pcs",
        }));

        const { error, count } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "store_id,pos_item_id", count: "exact" });

        if (error) {
          errors.push(`Batch ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
          skipped += chunk.length;
        } else {
          inserted += count ?? chunk.length;
        }
      }

      dbSpan.end({ output: { inserted, skipped, errors } });

      // 6. Calculate price change analytics (compare after upsert)
      let priceIncreased = 0;
      let priceDecreased = 0;
      for (const [posId, newPrice] of incomingPrices) {
        const old = oldPrices.get(posId);
        if (old !== undefined && old !== null) {
          if (newPrice > old) priceIncreased++;
          else if (newPrice < old) priceDecreased++;
        }
      }

      revalidatePath("/business/inventory");

      return { inserted, skipped, errors, ...base, priceIncreased, priceDecreased };
    },
    { rowCount: payload.rows.length }
  ).catch((err): UploadResult => ({
    inserted: 0, skipped: 0, errors: [String(err)], ...base,
  }));
}
