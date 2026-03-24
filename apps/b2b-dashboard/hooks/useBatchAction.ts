import { useState, useCallback } from "react";

interface BatchOptions {
  /**
   * How many items to process per chunk (default: 10).
   * Prevents hammering Supabase with 50 simultaneous RPCs.
   */
  chunkSize?: number;
  /**
   * Milliseconds to wait between chunks (default: 100).
   * Gives the DB/network a brief rest between bursts.
   */
  delayMs?: number;
}

interface BatchResult<TResult> {
  id: string;
  result?: TResult;
  error?: string;
}

interface UseBatchActionReturn<TResult> {
  /** Run the action for each id, chunked to avoid N+1 hammering. */
  runBatch: (ids: string[]) => Promise<BatchResult<TResult>[]>;
  isPending: boolean;
  /** Per-item results from the most recent batch run. */
  results: BatchResult<TResult>[];
  /** Reset results and error state. */
  reset: () => void;
}

/**
 * Wraps a `(id: string) => Promise<TResult>` server action so that bulk
 * operations are processed in chunks rather than issuing all requests at once.
 *
 * @example
 * const { runBatch, isPending } = useBatchAction(matchMarketPriceAction, {
 *   chunkSize: 10,
 *   delayMs: 100,
 * });
 * await runBatch(selectedProductIds); // processes 10 at a time
 */
export function useBatchAction<TResult>(
  action: (id: string) => Promise<TResult>,
  options: BatchOptions = {}
): UseBatchActionReturn<TResult> {
  const { chunkSize = 10, delayMs = 100 } = options;
  const [isPending, setIsPending] = useState(false);
  const [results, setResults] = useState<BatchResult<TResult>[]>([]);

  const runBatch = useCallback(
    async (ids: string[]): Promise<BatchResult<TResult>[]> => {
      setIsPending(true);
      setResults([]);
      const allResults: BatchResult<TResult>[] = [];

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);

        const chunkResults = await Promise.allSettled(
          chunk.map((id) => action(id))
        );

        const mapped: BatchResult<TResult>[] = chunkResults.map((r, idx) => ({
          id: chunk[idx],
          result: r.status === "fulfilled" ? r.value : undefined,
          error:
            r.status === "rejected"
              ? (r.reason instanceof Error ? r.reason.message : String(r.reason))
              : undefined,
        }));

        allResults.push(...mapped);
        setResults([...allResults]);

        // Brief pause between chunks — skip if last chunk
        if (i + chunkSize < ids.length && delayMs > 0) {
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }

      setIsPending(false);
      return allResults;
    },
    [action, chunkSize, delayMs]
  );

  const reset = useCallback(() => setResults([]), []);

  return { runBatch, isPending, results, reset };
}
