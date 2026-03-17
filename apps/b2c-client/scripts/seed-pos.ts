#!/usr/bin/env npx tsx
// ============================================================
// Nearbit – POS Seed Script
//
// Populates Supabase with a demo store + 18 common Israeli
// grocery items by calling the /api/ingest endpoint.
//
// Prerequisites:
//   1. Copy .env.local with NEXT_PUBLIC_SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY
//   2. Run: npm run seed
//      (starts Next.js dev server automatically via concurrently,
//       or point INGEST_URL at a running server)
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ---- Config ----

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INGEST_URL = process.env.INGEST_URL ?? 'http://localhost:3000/api/ingest';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    '❌  Missing env vars. Run with:\n' +
    '   npx tsx --env-file=.env.local scripts/seed-pos.ts'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---- Demo store ----

const DEMO_STORE = {
  name: 'מכולת שלמה – Shlomo\'s Makolet',
  slug: 'shlomo-makolet-demo',
  address: 'רחוב הרצל 12',
  city: 'תל אביב',
  phone: '03-1234567',
  pos_provider: 'manual' as const,
  pos_store_id: 'demo-001',
  is_active: true,
  // Herzl St 12, Tel Aviv (WGS-84)
  lat: 32.0650,
  lng: 34.7748,
};

// ---- 18 common Israeli grocery items ----
// Names are intentionally raw / POS-style to exercise LLM normalization.

const MOCK_PRODUCTS = [
  { id: 'p001', name: 'חומוס צבר 400גר',            price: 8.9,  quantity: 45,  unit: 'g',     barcode: '7290010555557' },
  { id: 'p002', name: 'קוטג 5% תנובה גביע 250',     price: 6.5,  quantity: 60,  unit: 'g',     barcode: '7290000066668' },
  { id: 'p003', name: 'חלה לשבת גדולה',              price: 14.9, quantity: 20,  unit: 'pcs',   barcode: '7290011223344' },
  { id: 'p004', name: 'במבה אריזה גדולה 200g',       price: 9.9,  quantity: 80,  unit: 'g',     barcode: '7290000777771' },
  { id: 'p005', name: 'חלב 3% תנובה 1L',             price: 6.9,  quantity: 50,  unit: 'liter', barcode: '7290000011118' },
  { id: 'p006', name: 'לחם אחיד פרוס 750 גרם',       price: 8.5,  quantity: 30,  unit: 'pcs',   barcode: '7290000022225' },
  { id: 'p007', name: 'ביצים L 12 יח',               price: 19.9, quantity: 25,  unit: 'pack',  barcode: '7290000033332' },
  { id: 'p008', name: 'גבינה לבנה 5% תנובה 250g',    price: 7.9,  quantity: 40,  unit: 'g',     barcode: '7290000044449' },
  { id: 'p009', name: 'עגבניות שרי 500g',             price: 11.9, quantity: 15,  unit: 'g',     barcode: '7290000055556' },
  { id: 'p010', name: 'מלפפון שדה 1 ק"ג',            price: 7.5,  quantity: 20,  unit: 'kg',    barcode: '7290000066663' },
  { id: 'p011', name: 'קוקה קולה 1.5 ליטר',          price: 8.9,  quantity: 100, unit: 'liter', barcode: '7290000077770' },
  { id: 'p012', name: 'שמן זית כתית מעולה 750מ"ל',   price: 39.9, quantity: 18,  unit: 'ml',    barcode: '7290000088887' },
  { id: 'p013', name: 'פסטה ספגטי De Cecco 500g',    price: 12.9, quantity: 35,  unit: 'g',     barcode: '7290000099994' },
  { id: 'p014', name: 'אורז יסמין קלאסי 1 ק"ג',     price: 15.9, quantity: 28,  unit: 'kg',    barcode: '7290000111101' },
  { id: 'p015', name: 'שוקולד מריר 70% 100g',         price: 9.9,  quantity: 55,  unit: 'g',     barcode: '7290000122208' },
  { id: 'p016', name: 'לבן 3% תנובה שקית 500g',      price: 5.5,  quantity: 40,  unit: 'g',     barcode: '7290000133315' },
  { id: 'p017', name: 'טונה בשמן אמין 160g',          price: 8.5,  quantity: 70,  unit: 'g',     barcode: '7290000144422' },
  { id: 'p018', name: 'חמאה 250g אמבה',              price: 13.9, quantity: 22,  unit: 'g',     barcode: '7290000155539' },
];

// ---- Main ----

async function seed() {
  console.log('🌱 Nearbit seed script starting…\n');

  // 1. Create or fetch the demo store
  const { data: existing } = await supabase
    .from('stores')
    .select('id, name')
    .eq('slug', DEMO_STORE.slug)
    .maybeSingle();

  let storeId: string;

  if (existing) {
    storeId = existing.id as string;
    console.log(`ℹ️  Demo store already exists: ${existing.name} (${storeId})`);
  } else {
    const { data: created, error } = await supabase
      .from('stores')
      .insert(DEMO_STORE)
      .select('id, name')
      .single();

    if (error || !created) {
      console.error('❌  Failed to create demo store:', error?.message);
      process.exit(1);
    }

    storeId = created.id as string;
    console.log(`✅  Created demo store: ${created.name} (${storeId})`);
  }

  // 2. Call /api/ingest
  console.log(`\n📦  Sending ${MOCK_PRODUCTS.length} products to ${INGEST_URL}…`);
  console.log('    (This triggers LLM normalization + embedding — may take ~15-30s)\n');

  let res: Response;
  try {
    res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        provider: 'manual',
        products: MOCK_PRODUCTS,
      }),
    });
  } catch (err) {
    console.error(
      '❌  Could not reach the ingest endpoint.\n' +
      '    Make sure the Next.js dev server is running: npm run dev\n',
      err
    );
    process.exit(1);
  }

  const json = await res.json();

  if (!res.ok) {
    console.error('❌  Ingest failed:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log('✅  Ingest complete!');
  console.log(`    Store  : ${json.store.name}`);
  console.log(`    Sent   : ${json.processed} products`);
  console.log(`    Upserted: ${json.upserted} rows`);
  console.log(`\n🔍  Test it: http://localhost:3000\n`);
}

seed().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
