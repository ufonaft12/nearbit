import { Langfuse } from "langfuse";

// Singleton Langfuse client for server-side usage
let langfuseInstance: Langfuse | null = null;

export function getLangfuse(): Langfuse {
  if (!langfuseInstance) {
    langfuseInstance = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      baseUrl: process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com",
      flushAt: 10,
      flushInterval: 5000,
    });
  }
  return langfuseInstance;
}

/**
 * Wraps an async operation with a Langfuse span for tracing.
 *
 * @example
 * const result = await withTrace("inventory-upload", async (span) => {
 *   span.update({ input: { rowCount: rows.length } });
 *   return processRows(rows);
 * });
 */
export async function withTrace<T>(
  name: string,
  fn: (span: ReturnType<Langfuse["trace"]>) => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const lf = getLangfuse();
  const trace = lf.trace({ name, metadata });

  try {
    const result = await fn(trace);
    trace.update({ output: { status: "success" } });
    return result;
  } catch (error) {
    trace.update({
      output: {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    await lf.flushAsync();
  }
}
