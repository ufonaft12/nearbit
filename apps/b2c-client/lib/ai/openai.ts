import OpenAI from 'openai';
import type { NormalizedProduct, PosProduct } from '@/types/nearbit';

// ============================================================
// Nearbit – OpenAI Service Layer
//
// Models:
//   • gpt-4o-mini   → normalization logic (cheap, fast)
//   • text-embedding-3-small (1536-dim) → semantic embeddings
// ============================================================

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing env: OPENAI_API_KEY');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---- Constants ----

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;
export const EMBEDDING_DIMENSIONS = 1536;
export const CHAT_MODEL = 'gpt-4o-mini' as const;

// Max products to normalize in a single LLM call (token budget)
const NORMALIZE_BATCH_SIZE = 30;

// ============================================================
// generateEmbedding
// Returns a 1536-dim vector for a single text string.
// ============================================================
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

// ============================================================
// generateEmbeddingsBatch
// Embeds multiple strings in one API call (up to 2048 inputs).
// Returns embeddings in the same order as the input array.
// ============================================================
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.trim()),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // API guarantees order matches input, but let's be safe
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// ============================================================
// buildEmbeddingText
// Canonical text representation used for embedding a product.
// Format: "<normalized_name> <category> <unit>"
// ============================================================
export function buildEmbeddingText(product: NormalizedProduct): string {
  // Include all three language names so queries in Hebrew, Russian, or English
  // all land near the same vector.
  return [product.nameHe, product.nameRu, product.nameEn, product.category, product.unit]
    .filter(Boolean)
    .join(' ');
}

// ============================================================
// normalizeProducts
// Sends raw POS product names to GPT-4o-mini for multilingual
// normalization and category tagging. Processes in batches to
// stay within token limits.
// ============================================================
export async function normalizeProducts(
  products: PosProduct[]
): Promise<NormalizedProduct[]> {
  const results: NormalizedProduct[] = [];

  for (let i = 0; i < products.length; i += NORMALIZE_BATCH_SIZE) {
    const batch = products.slice(i, i + NORMALIZE_BATCH_SIZE);
    const normalized = await normalizeBatch(batch);
    results.push(...normalized);
  }

  return results;
}

async function normalizeBatch(
  products: PosProduct[]
): Promise<NormalizedProduct[]> {
  const inputJson = JSON.stringify(
    products.map((p) => ({ id: p.id, name: p.name }))
  );

  const systemPrompt = `You are a product catalog normalizer for an Israeli retail aggregator.
Your task is to normalize product names that may be in Hebrew, Russian, or mixed languages.

For each product, return a JSON array with objects containing:
- posItemId: the original "id" field (string, unchanged)
- rawName: the original "name" field (string, unchanged)
- nameHe: clean Hebrew product name (string)
- nameRu: Russian name/transliteration (string)
- nameEn: English name/transliteration (string)
- category: product category in English, one of: [dairy, bakery, produce, meat, fish, beverages, snacks, frozen, household, personal_care, alcohol, other]
- unit: one of [kg, g, liter, ml, pcs, pack, other]

Rules:
- Keep Hebrew names authentic, fix spelling if obviously wrong
- For Russian: transliterate or translate appropriately for Russian-speaking customers
- For English: use standard supermarket English names
- Choose the most specific category that fits
- Infer unit from context if not explicit (milk → liter, bread → pcs, cheese → kg)
- Return ONLY a valid JSON array, no markdown, no explanation`;

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Normalize these products:\n${inputJson}\n\nReturn JSON: { "products": [...] }`,
      },
    ],
  });

  const content = response.choices[0].message.content ?? '{}';
  const parsed = JSON.parse(content) as { products?: NormalizedProduct[] };

  if (!Array.isArray(parsed.products)) {
    throw new Error('LLM returned unexpected format during normalization');
  }

  return parsed.products;
}

// ============================================================
// semanticSearch
// Generates an embedding for the user query and returns it
// for use with the Supabase search_products RPC.
// ============================================================
export async function getQueryEmbedding(query: string): Promise<number[]> {
  return generateEmbedding(query);
}

// ============================================================
// generateSearchAnswer
// Takes a user query + search results and produces a concise
// natural-language answer (RAG final step).
// ============================================================
export async function generateSearchAnswer(
  query: string,
  results: Array<{
    normalizedName: string;
    price: number | null;
    quantity: number | null;
    unit: string | null;
    storeName?: string;
  }>
): Promise<string> {
  if (results.length === 0) {
    return 'לא נמצאו מוצרים תואמים לחיפוש שלך.';
  }

  const productList = results
    .map((r, i) => {
      const price = r.price != null ? `${r.price} ₪` : 'מחיר לא זמין';
      const qty =
        r.quantity != null ? `${r.quantity} ${r.unit ?? ''}`.trim() : '';
      const store = r.storeName ? ` at ${r.storeName}` : '';
      return `${i + 1}. ${r.normalizedName} — ${price}${qty ? ` (${qty})` : ''}${store}`;
    })
    .join('\n');

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are a helpful shopping assistant for an Israeli local store aggregator called Nearbit.
Answer in the same language the user used (Hebrew/Russian/English).
Be concise and friendly. Mention prices. If items are out of stock (quantity 0), say so.`,
      },
      {
        role: 'user',
        content: `User query: "${query}"\n\nFound products:\n${productList}\n\nProvide a helpful answer.`,
      },
    ],
  });

  return response.choices[0].message.content ?? '';
}
