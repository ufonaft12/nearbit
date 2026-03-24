import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';

import { supabaseAdmin } from '@/lib/supabase/client';
import {
  normalizeProducts,
  generateEmbeddingsBatch,
  buildEmbeddingText,
} from '@/lib/ai/openai';
import type { NormalizedProduct } from '@/types/nearbit';

// Allowed values match the DB CHECK constraint on products.unit
const ALLOWED_UNITS = new Set(['kg', 'g', 'liter', 'ml', 'pcs', 'pack', 'other']);
function sanitizeUnit(unit: string | undefined): string | null {
  if (!unit) return null;
  return ALLOWED_UNITS.has(unit) ? unit : 'other';
}

// ============================================================
// POST /api/ingest
//
// Pipeline:
//   1. Validate request body
//   2. Fetch store from DB (verifies storeId exists)
//   3. Normalize raw product names via GPT-4o-mini (batched)
//   4. Generate embeddings for all products (batched)
//   5. Upsert into `products` table (on conflict: update)
//   6. Return summary
// ============================================================

// ---- Request Schema ----

const PosProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  barcode: z.string().optional(),
});

const IngestRequestSchema = z.object({
  storeId: z.string().uuid(),
  provider: z.enum(['morning', 'green_invoice', 'manual', 'other']),
  products: z.array(PosProductSchema).min(1).max(500),
});

// ---- Handler ----

export async function POST(req: NextRequest) {
  // 1. Parse & validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = IngestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { storeId, products: rawProducts } = parsed.data;

  // 2. Verify store exists
  const { data: store, error: storeError } = await supabaseAdmin
    .from('stores')
    .select('id, name')
    .eq('id', storeId)
    .single();

  if (storeError || !store) {
    return NextResponse.json(
      { error: `Store not found: ${storeId}` },
      { status: 404 }
    );
  }

  // 3. Compute sync hashes up front so we can skip unchanged products.
  const hashByPosId = new Map<string, string>();
  for (const raw of rawProducts) {
    hashByPosId.set(
      raw.id,
      crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex')
    );
  }

  // Fetch existing hashes for this store in one query.
  const { data: existingRows } = await supabaseAdmin
    .from('products')
    .select('pos_item_id, sync_hash')
    .eq('store_id', storeId)
    .in('pos_item_id', rawProducts.map((p) => p.id));

  const existingHashMap = new Map(
    (existingRows ?? []).map((r: { pos_item_id: string; sync_hash: string | null }) => [
      r.pos_item_id,
      r.sync_hash,
    ])
  );

  // Only run LLM + embedding on products whose payload actually changed.
  const changedProducts = rawProducts.filter(
    (p) => existingHashMap.get(p.id) !== hashByPosId.get(p.id)
  );
  const unchangedCount = rawProducts.length - changedProducts.length;
  if (unchangedCount > 0) {
    console.log(`[ingest] skipping ${unchangedCount} unchanged product(s)`);
  }

  // If nothing changed, return early.
  if (changedProducts.length === 0) {
    return NextResponse.json({
      success: true,
      store: { id: store.id, name: store.name },
      processed: rawProducts.length,
      upserted: 0,
      skipped: unchangedCount,
    });
  }

  // 4. Normalize names via LLM (only changed products)
  let normalized: NormalizedProduct[];
  try {
    normalized = await normalizeProducts(changedProducts);
  } catch (err) {
    console.error('[ingest] normalization error', err);
    return NextResponse.json(
      { error: 'Failed to normalize products via LLM' },
      { status: 502 }
    );
  }

  // Build a lookup map for quick access
  const normalizedMap = new Map(normalized.map((n) => [n.posItemId, n]));

  // 5. Generate embeddings for changed products only.
  // IMPORTANT: build texts in changedProducts order so embeddings[idx] aligns below.
  const embeddingTexts = changedProducts.map((raw) => {
    const norm = normalizedMap.get(raw.id);
    return norm ? buildEmbeddingText(norm) : raw.name;
  });
  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddingsBatch(embeddingTexts);
  } catch (err) {
    console.error('[ingest] embedding error', err);
    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 502 }
    );
  }

  // 6. Prepare upsert rows (only changed products; hashes already computed above)
  const rows = changedProducts.map((raw, idx) => {
    const norm = normalizedMap.get(raw.id);

    return {
      store_id: storeId,
      pos_item_id: raw.id,
      raw_name: raw.name,
      raw_price: raw.price,
      raw_quantity: raw.quantity ?? null,
      raw_unit: raw.unit ?? null,
      raw_barcode: raw.barcode ?? null,
      // Normalized fields
      name_he: norm?.nameHe ?? null,
      name_ru: norm?.nameRu ?? null,
      name_en: norm?.nameEn ?? null,
      category: norm?.category ?? null,
      price: raw.price,
      quantity: raw.quantity ?? null,
      unit: sanitizeUnit(norm?.unit),
      barcode: raw.barcode ?? null,
      // Embedding stored as a Postgres vector literal string
      embedding: `[${embeddings[idx].join(',')}]`,
      sync_hash: hashByPosId.get(raw.id)!,
      last_synced_at: new Date().toISOString(),
      is_available: true,
    };
  });

  // 6. Upsert (insert or update on conflict)
  const { error: upsertError, count } = await supabaseAdmin
    .from('products')
    .upsert(rows, {
      onConflict: 'store_id,pos_item_id',
      count: 'exact',
    });

  if (upsertError) {
    console.error('[ingest] upsert error', upsertError);
    return NextResponse.json(
      { error: 'Database upsert failed', details: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    store: { id: store.id, name: store.name },
    processed: rawProducts.length,
    upserted: count,
    skipped: unchangedCount,
  });
}

// ============================================================
// GET /api/ingest  (dev-only: test with sample payload)
// Returns a sample payload you can POST to test the pipeline.
// ============================================================
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const samplePayload = {
    storeId: '00000000-0000-0000-0000-000000000001', // replace with real store UUID
    provider: 'manual',
    products: [
      { id: 'p001', name: 'חלב 3% תנובה 1 ליטר', price: 6.9, quantity: 50, unit: 'liter', barcode: '7290000000001' },
      { id: 'p002', name: 'לחם אחיד פרוס 750 גרם', price: 8.5, quantity: 30, unit: 'pcs', barcode: '7290000000002' },
      { id: 'p003', name: 'עגבניות שרי 500 גרם', price: 12.9, quantity: 20, unit: 'g', barcode: '7290000000003' },
      { id: 'p004', name: 'גבינה צהובה 28% אמק 200g', price: 14.9, quantity: 15, unit: 'g', barcode: '7290000000004' },
      { id: 'p005', name: 'קוקה קולה 1.5L', price: 7.9, quantity: 100, unit: 'liter', barcode: '7290000000005' },
    ],
  };

  return NextResponse.json({
    description: 'Sample POST payload for /api/ingest',
    usage: 'POST /api/ingest with this body (replace storeId with a real UUID)',
    sample: samplePayload,
  });
}
