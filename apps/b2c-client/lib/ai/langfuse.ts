/**
 * Nearbit – Langfuse observability for LangChain
 *
 * Creates a per-request CallbackHandler so every LLM call is traced
 * in the Langfuse dashboard.
 *
 * Usage:
 *   const handler = makeLangfuseHandler({ userId: ip, metadata: { route: '/api/search' } });
 *   await chain.invoke({ query }, { callbacks: [handler] });
 *   await handler.flushAsync();   // required before serverless function exits
 *
 * Fails silently if LANGFUSE_PUBLIC_KEY is not set — tracing is optional.
 */

import { CallbackHandler } from 'langfuse-langchain';

interface HandlerOptions {
  /** Client IP or authenticated user ID — groups traces in the Users tab */
  userId?:    string;
  sessionId?: string;
  metadata?:  Record<string, unknown>;
}

/**
 * Returns a Langfuse CallbackHandler for the current request, or null if
 * Langfuse env vars are not configured (tracing disabled, fails open).
 */
export function makeLangfuseHandler(opts?: HandlerOptions): CallbackHandler | null {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return null;
  }

  return new CallbackHandler({
    publicKey:  process.env.LANGFUSE_PUBLIC_KEY,
    secretKey:  process.env.LANGFUSE_SECRET_KEY,
    baseUrl:    process.env.LANGFUSE_BASEURL,   // optional, defaults to cloud.langfuse.com
    userId:     opts?.userId,
    sessionId:  opts?.sessionId,
    metadata:   opts?.metadata,
  });
}
