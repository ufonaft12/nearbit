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

  // 3. Normalize names via LLM
  let normalized: NormalizedProduct[];
  try {
    normalized = await normalizeProducts(rawProducts);
  } catch (err) {
    console.error('[ingest] normalization error', err);
    return NextResponse.json(
      { error: 'Failed to normalize products via LLM' },
      { status: 502 }
    );
  }

  // Build a lookup map for quick access
  const normalizedMap = new Map(normalized.map((n) => [n.posItemId, n]));

  // 4. Generate embeddings for all products in one batch call
  const embeddingTexts = normalized.map(buildEmbeddingText);
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

  // 5. Prepare upsert rows
  const rows = rawProducts.map((raw, idx) => {
    const norm = normalizedMap.get(raw.id);
    const syncPayload = JSON.stringify(raw);
    const syncHash = crypto
      .createHash('sha256')
      .update(syncPayload)
      .digest('hex');

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
      unit: norm?.unit ?? null,
      barcode: raw.barcode ?? null,
      // Embedding stored as a Postgres vector literal string
      embedding: `[${embeddings[idx].join(',')}]`,
      sync_hash: syncHash,
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
