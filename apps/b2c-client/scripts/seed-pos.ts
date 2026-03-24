#!/usr/bin/env npx tsx
// ============================================================
// Nearbit – POS Seed Script
//
// Populates Supabase with demo stores + common Israeli grocery
// items by calling the /api/ingest endpoint.
//
// Stores:
//   - Tel Aviv  : מכולת שלמה (Herzl St 12)
//   - Beer Sheva: מינימרקט דוד (Rager Blvd 45)
//   - Beer Sheva: סופר נגב (Trumpeldor 7, Dalet neighbourhood)
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

// ---- Store + products definitions ----

type StoreRecord = {
  name: string;
  slug: string;
  address: string;
  city: string;
  phone: string;
  pos_provider: 'manual';
  pos_store_id: string;
  is_active: boolean;
  lat: number;
  lng: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  barcode: string;
};

type StoreEntry = {
  store: StoreRecord;
  products: Product[];
};

// ──────────────────────────────────────────────────────────────
// Tel Aviv — Herzl St 12  (32.0650, 34.7748)
// ──────────────────────────────────────────────────────────────
const TEL_AVIV_STORE: StoreEntry = {
  store: {
    name: 'מכולת שלמה – Shlomo\'s Makolet',
    slug: 'shlomo-makolet-demo',
    address: 'רחוב הרצל 12',
    city: 'תל אביב',
    phone: '03-1234567',
    pos_provider: 'manual',
    pos_store_id: 'demo-001',
    is_active: true,
    lat: 32.0650,
    lng: 34.7748,
  },
  // Names are intentionally raw / POS-style to exercise LLM normalization.
  products: [
    { id: 'tlv-p001', name: 'חומוס צבר 400גר',            price: 8.9,  quantity: 45,  unit: 'g',     barcode: '7290010555557' },
    { id: 'tlv-p002', name: 'קוטג 5% תנובה גביע 250',     price: 6.5,  quantity: 60,  unit: 'g',     barcode: '7290000066668' },
    { id: 'tlv-p003', name: 'חלה לשבת גדולה',              price: 14.9, quantity: 20,  unit: 'pcs',   barcode: '7290011223344' },
    { id: 'tlv-p004', name: 'במבה אריזה גדולה 200g',       price: 9.9,  quantity: 80,  unit: 'g',     barcode: '7290000777771' },
    { id: 'tlv-p005', name: 'חלב 3% תנובה 1L',             price: 6.9,  quantity: 50,  unit: 'liter', barcode: '7290000011118' },
    { id: 'tlv-p006', name: 'לחם אחיד פרוס 750 גרם',       price: 8.5,  quantity: 30,  unit: 'pcs',   barcode: '7290000022225' },
    { id: 'tlv-p007', name: 'ביצים L 12 יח',               price: 19.9, quantity: 25,  unit: 'pack',  barcode: '7290000033332' },
    { id: 'tlv-p008', name: 'גבינה לבנה 5% תנובה 250g',    price: 7.9,  quantity: 40,  unit: 'g',     barcode: '7290000044449' },
    { id: 'tlv-p009', name: 'עגבניות שרי 500g',             price: 11.9, quantity: 15,  unit: 'g',     barcode: '7290000055556' },
    { id: 'tlv-p010', name: 'מלפפון שדה 1 ק"ג',            price: 7.5,  quantity: 20,  unit: 'kg',    barcode: '7290000066663' },
    { id: 'tlv-p011', name: 'קוקה קולה 1.5 ליטר',          price: 8.9,  quantity: 100, unit: 'liter', barcode: '7290000077770' },
    { id: 'tlv-p012', name: 'שמן זית כתית מעולה 750מ"ל',   price: 39.9, quantity: 18,  unit: 'ml',    barcode: '7290000088887' },
    { id: 'tlv-p013', name: 'פסטה ספגטי De Cecco 500g',    price: 12.9, quantity: 35,  unit: 'g',     barcode: '7290000099994' },
    { id: 'tlv-p014', name: 'אורז יסמין קלאסי 1 ק"ג',     price: 15.9, quantity: 28,  unit: 'kg',    barcode: '7290000111101' },
    { id: 'tlv-p015', name: 'שוקולד מריר 70% 100g',         price: 9.9,  quantity: 55,  unit: 'g',     barcode: '7290000122208' },
    { id: 'tlv-p016', name: 'לבן 3% תנובה שקית 500g',      price: 5.5,  quantity: 40,  unit: 'g',     barcode: '7290000133315' },
    { id: 'tlv-p017', name: 'טונה בשמן אמין 160g',          price: 8.5,  quantity: 70,  unit: 'g',     barcode: '7290000144422' },
    { id: 'tlv-p018', name: 'חמאה 250g אמבה',              price: 13.9, quantity: 22,  unit: 'g',     barcode: '7290000155539' },
  ],
};

// ──────────────────────────────────────────────────────────────
// Beer Sheva — Rager Blvd 45, central area  (31.2430, 34.8010)
// ──────────────────────────────────────────────────────────────
const BEER_SHEVA_STORE_1: StoreEntry = {
  store: {
    name: 'מינימרקט דוד – David\'s Mini',
    slug: 'david-mini-beer-sheva',
    address: 'שד\' רגר 45',
    city: 'באר שבע',
    phone: '08-6111222',
    pos_provider: 'manual',
    pos_store_id: 'demo-002',
    is_active: true,
    // Rager Blvd 45, Beer Sheva (WGS-84)
    lat: 31.2430,
    lng: 34.8010,
  },
  products: [
    { id: 'bs1-p001', name: 'חומוס אחלה 400ג',             price: 8.5,  quantity: 30,  unit: 'g',     barcode: '7290010555557' },
    { id: 'bs1-p002', name: 'קוטג תנובה 5% 250 גרם',       price: 6.9,  quantity: 50,  unit: 'g',     barcode: '7290000066668' },
    { id: 'bs1-p003', name: 'חלה שישי גדולה',               price: 13.9, quantity: 15,  unit: 'pcs',   barcode: '7290011223344' },
    { id: 'bs1-p004', name: 'במבה 200 גרם',                 price: 9.5,  quantity: 90,  unit: 'g',     barcode: '7290000777771' },
    { id: 'bs1-p005', name: 'חלב תנובה 3 אחוז ליטר',       price: 6.7,  quantity: 60,  unit: 'liter', barcode: '7290000011118' },
    { id: 'bs1-p006', name: 'לחם פרוס אחיד 750g',           price: 7.9,  quantity: 35,  unit: 'pcs',   barcode: '7290000022225' },
    { id: 'bs1-p007', name: 'ביצים גדולות 12 יח L',         price: 18.9, quantity: 30,  unit: 'pack',  barcode: '7290000033332' },
    { id: 'bs1-p008', name: 'גבינה לבנה 5 אחוז תנובה 250', price: 7.5,  quantity: 45,  unit: 'g',     barcode: '7290000044449' },
    { id: 'bs1-p009', name: 'עגבניות שרי קטנות 500גר',      price: 10.9, quantity: 20,  unit: 'g',     barcode: '7290000055556' },
    { id: 'bs1-p010', name: 'מלפפון 1 קילו',                price: 6.9,  quantity: 25,  unit: 'kg',    barcode: '7290000066663' },
    { id: 'bs1-p011', name: 'קולה 1.5L',                    price: 7.9,  quantity: 120, unit: 'liter', barcode: '7290000077770' },
    { id: 'bs1-p012', name: 'שמן זית כתית 750 מ"ל',         price: 37.9, quantity: 12,  unit: 'ml',    barcode: '7290000088887' },
    { id: 'bs1-p013', name: 'ספגטי 500 גרם',                price: 11.9, quantity: 40,  unit: 'g',     barcode: '7290000099994' },
    { id: 'bs1-p014', name: 'אורז 1 קג יסמין',              price: 14.9, quantity: 30,  unit: 'kg',    barcode: '7290000111101' },
    { id: 'bs1-p015', name: 'שוקולד עם 70 אחוז מוצק קקאו', price: 10.5, quantity: 40,  unit: 'g',     barcode: '7290000122208' },
    { id: 'bs1-p016', name: 'לבן תנובה 3% שקית',            price: 5.2,  quantity: 35,  unit: 'g',     barcode: '7290000133315' },
    { id: 'bs1-p017', name: 'טונה בשמן 160 גרם',             price: 7.9,  quantity: 80,  unit: 'g',     barcode: '7290000144422' },
    { id: 'bs1-p018', name: 'חמאה אמבה 250 גר',             price: 13.5, quantity: 18,  unit: 'g',     barcode: '7290000155539' },
    // Beer Sheva extras
    { id: 'bs1-p019', name: 'פיתה ערבית 8 יח',              price: 6.9,  quantity: 50,  unit: 'pcs',   barcode: '7290001900001' },
    { id: 'bs1-p020', name: 'טחינה גולמית 500g',             price: 18.9, quantity: 25,  unit: 'g',     barcode: '7290001900002' },
    { id: 'bs1-p021', name: 'שוקו מיל 1 ליטר',              price: 7.5,  quantity: 40,  unit: 'liter', barcode: '7290001900003' },
    { id: 'bs1-p022', name: 'אבטיח שלם 5-6 ק"ג',            price: 24.9, quantity: 8,   unit: 'kg',    barcode: '7290001900004' },
  ],
};

// ──────────────────────────────────────────────────────────────
// Beer Sheva — Trumpeldor 7, Dalet neighbourhood (31.2718, 34.7966)
// ──────────────────────────────────────────────────────────────
const BEER_SHEVA_STORE_2: StoreEntry = {
  store: {
    name: 'סופר נגב – Super Negev',
    slug: 'super-negev-dalet',
    address: 'רחוב טרומפלדור 7',
    city: 'באר שבע',
    phone: '08-6333444',
    pos_provider: 'manual',
    pos_store_id: 'demo-003',
    is_active: true,
    // Trumpeldor St 7, Dalet neighbourhood, Beer Sheva (WGS-84)
    lat: 31.2718,
    lng: 34.7966,
  },
  products: [
    { id: 'bs2-p001', name: 'חומוס צבר גביע 400 גרם',       price: 9.2,  quantity: 20,  unit: 'g',     barcode: '7290010555557' },
    { id: 'bs2-p002', name: 'קוטג 5% כוס 250 גרם תנובה',   price: 6.3,  quantity: 40,  unit: 'g',     barcode: '7290000066668' },
    { id: 'bs2-p003', name: 'חלה גדולה שישי',               price: 15.5, quantity: 12,  unit: 'pcs',   barcode: '7290011223344' },
    { id: 'bs2-p004', name: 'במבה ביסלי 200 גרם',            price: 10.2, quantity: 60,  unit: 'g',     barcode: '7290000777771' },
    { id: 'bs2-p005', name: 'חלב שלם 3% 1 ליטר',            price: 7.1,  quantity: 45,  unit: 'liter', barcode: '7290000011118' },
    { id: 'bs2-p006', name: 'לחם אחיד פרוס',                 price: 8.2,  quantity: 25,  unit: 'pcs',   barcode: '7290000022225' },
    { id: 'bs2-p007', name: 'ביצי תרנגולת L 12',            price: 20.5, quantity: 20,  unit: 'pack',  barcode: '7290000033332' },
    { id: 'bs2-p008', name: 'גבינה לבנה תנובה 5% 250g',     price: 8.1,  quantity: 35,  unit: 'g',     barcode: '7290000044449' },
    { id: 'bs2-p009', name: 'עגבניות שרי אדומות 500g',       price: 12.5, quantity: 10,  unit: 'g',     barcode: '7290000055556' },
    { id: 'bs2-p010', name: 'מלפפונים 1 ק"ג שדה',           price: 7.2,  quantity: 18,  unit: 'kg',    barcode: '7290000066663' },
    { id: 'bs2-p011', name: 'קוקה קולה בקבוק 1.5',          price: 8.5,  quantity: 80,  unit: 'liter', barcode: '7290000077770' },
    { id: 'bs2-p012', name: 'שמן זית בכתית עולה 750מ"ל',    price: 41.5, quantity: 10,  unit: 'ml',    barcode: '7290000088887' },
    { id: 'bs2-p013', name: 'מקרוני ספגטי 500ג',             price: 13.5, quantity: 30,  unit: 'g',     barcode: '7290000099994' },
    { id: 'bs2-p014', name: 'אורז יסמין 1 קילוגרם',         price: 16.5, quantity: 22,  unit: 'kg',    barcode: '7290000111101' },
    { id: 'bs2-p015', name: 'שוקולד מריר 100 גרם',           price: 9.5,  quantity: 45,  unit: 'g',     barcode: '7290000122208' },
    { id: 'bs2-p016', name: 'לבן 3% שקית 500 גרם תנובה',    price: 5.7,  quantity: 30,  unit: 'g',     barcode: '7290000133315' },
    { id: 'bs2-p017', name: 'טונה בשמן פרמיום 160g',         price: 9.2,  quantity: 55,  unit: 'g',     barcode: '7290000144422' },
    { id: 'bs2-p018', name: 'חמאה 82% שומן 250g',            price: 14.5, quantity: 16,  unit: 'g',     barcode: '7290000155539' },
    // Beer Sheva extras
    { id: 'bs2-p019', name: 'לאפה גדולה 5 יח',              price: 8.9,  quantity: 30,  unit: 'pcs',   barcode: '7290002000001' },
    { id: 'bs2-p020', name: 'טחינה מוכנה 400 גרם',           price: 14.9, quantity: 20,  unit: 'g',     barcode: '7290002000002' },
    { id: 'bs2-p021', name: 'מי עדן 1.5 ליטר',              price: 4.9,  quantity: 100, unit: 'liter', barcode: '7290002000003' },
    { id: 'bs2-p022', name: 'פלפל אדום 1 ק"ג',              price: 9.9,  quantity: 15,  unit: 'kg',    barcode: '7290002000004' },
    { id: 'bs2-p023', name: 'בצל צהוב 1 ק"ג',               price: 5.9,  quantity: 20,  unit: 'kg',    barcode: '7290002000005' },
  ],
};

// ---- All stores to seed ----

const ALL_STORES: StoreEntry[] = [
  TEL_AVIV_STORE,
  BEER_SHEVA_STORE_1,
  BEER_SHEVA_STORE_2,
];

// ---- Seed one store ----

async function seedStore({ store, products }: StoreEntry): Promise<void> {
  console.log(`\n🏪  Processing: ${store.name} (${store.city})`);

  // 1. Create or fetch the store
  const { data: existing } = await supabase
    .from('stores')
    .select('id, name')
    .eq('slug', store.slug)
    .maybeSingle();

  let storeId: string;

  if (existing) {
    storeId = existing.id as string;
    console.log(`    ℹ️  Already exists (${storeId})`);
  } else {
    const { data: created, error } = await supabase
      .from('stores')
      .insert(store)
      .select('id, name')
      .single();

    if (error || !created) {
      console.error(`    ❌  Failed to create store: ${error?.message}`);
      process.exit(1);
    }

    storeId = created.id as string;
    console.log(`    ✅  Created (${storeId})`);
  }

  // 2. Call /api/ingest
  console.log(`    📦  Ingesting ${products.length} products…`);

  let res: Response;
  try {
    res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        provider: 'manual',
        products,
      }),
    });
  } catch (err) {
    console.error(
      '    ❌  Could not reach the ingest endpoint.\n' +
      '        Make sure the Next.js dev server is running: npm run dev\n',
      err
    );
    process.exit(1);
  }

  const json = await res.json();

  if (!res.ok) {
    console.error('    ❌  Ingest failed:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(`    ✅  Done — ${json.processed} products, ${json.upserted} upserted`);
}

// ---- Main ----

async function seed() {
  console.log('🌱 Nearbit seed script starting…');
  console.log(`   Stores  : ${ALL_STORES.length}`);
  console.log(`   Endpoint: ${INGEST_URL}`);
  console.log('   (LLM normalization + embeddings — may take ~30-60s total)\n');

  for (const entry of ALL_STORES) {
    await seedStore(entry);
  }

  console.log('\n🎉  All stores seeded successfully!');
  console.log(`🔍  Test it: http://localhost:3000\n`);
}

seed().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
