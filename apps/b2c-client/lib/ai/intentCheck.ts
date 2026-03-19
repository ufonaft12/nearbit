/**
 * Nearbit – LangChain semantic intent check
 *
 * Uses GPT-4o-mini to decide whether a search query is a genuine
 * grocery / product search ("YES") or unrelated text ("NO").
 *
 * Redis cache: intent:<sha256(query)>  TTL 24 h
 * A cached "YES"/"NO" means the same query is never sent to OpenAI twice.
 * Fails open (returns true) if the LLM or Redis are unavailable.
 *
 * Langfuse tracing: if LANGFUSE_PUBLIC_KEY is set, each uncached LLM call
 * is traced with the client IP as userId.
 */

import { createHash } from 'crypto';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { redis } from '@/lib/redis';
import { makeLangfuseHandler } from '@/lib/ai/langfuse';

const INTENT_CACHE_TTL = 60 * 60 * 24; // 24 h

const INTENT_PROMPT =
  "You are a shopping assistant for Nearbit. " +
  "Analyze if the input is a list of grocery products, a single food item, or a shopping query. " +
  "Answer only 'YES' or 'NO'.\nInput: {query}";

// Build the chain once at module load (model instance is stateless/reusable)
const llm   = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
const chain = PromptTemplate.fromTemplate(INTENT_PROMPT)
  .pipe(llm)
  .pipe(new StringOutputParser());

/**
 * Returns true if the query looks like a genuine product / grocery search.
 * Returns true (fail open) on any error so the main pipeline is never blocked
 * by an unavailable LLM or Redis.
 *
 * @param query  - the search string to classify
 * @param userId - optional client IP / user ID forwarded to Langfuse traces
 */
export async function checkProductIntent(query: string, userId?: string): Promise<boolean> {
  const normalized = query.toLowerCase().trim();
  const cacheKey   = `intent:${createHash('sha256').update(normalized).digest('hex')}`;

  // 1. Redis cache check — cached results skip the LLM entirely
  if (redis) {
    try {
      const cached = await redis.get<string>(cacheKey);
      if (cached !== null) {
        console.log(`[intent] cache HIT — "${normalized.slice(0, 40)}" → ${cached}`);
        return cached === 'YES';
      }
    } catch { /* ignore, fall through to LLM */ }
  }

  // 2. LLM call (only reached on cache miss)
  const handler = makeLangfuseHandler({
    userId,
    metadata: { query: normalized, route: 'intentCheck' },
  });

  try {
    const result = await chain.invoke(
      { query: normalized },
      handler ? { callbacks: [handler] } : {},
    );
    const isProduct = result.trim().toUpperCase().startsWith('YES');

    // Fire-and-forget: both Redis write and Langfuse flush run in the background
    // so they don't add latency to the API response.
    if (redis) {
      redis
        .set(cacheKey, isProduct ? 'YES' : 'NO', { ex: INTENT_CACHE_TTL })
        .catch(() => {});
    }
    if (handler) handler.flushAsync().catch(() => {});

    console.log(`[intent] LLM "${normalized.slice(0, 40)}" → ${isProduct ? 'YES' : 'NO'}`);
    return isProduct;
  } catch (err) {
    if (handler) handler.flushAsync().catch(() => {});
    console.warn('[intent] LLM error — fail open', err);
    return true;
  }
}
