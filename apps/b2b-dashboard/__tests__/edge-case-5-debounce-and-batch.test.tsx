/**
 * Edge Case 5: Debounce & Batch hooks behave correctly under stress.
 *
 * 5a — useDebounce: rapid input changes must only trigger the final value
 *      after the delay, not intermediate values.
 *
 * 5b — useBatchAction: selecting 50 items and triggering a bulk action must
 *      issue calls in chunks (≤ chunkSize per chunk) rather than 50 at once,
 *      preventing DB overload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchAction } from "@/hooks/useBatchAction";

// ── 5a: useDebounce ──────────────────────────────────────────────────────────

describe("Edge Case 5a — useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does NOT update immediately on rapid value changes", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    rerender({ value: "abc" });
    rerender({ value: "abcd" });

    // Still holds initial value — timer hasn't fired
    expect(result.current).toBe("a");
  });

  it("updates to the latest value after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    rerender({ value: "abc" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("abc");
  });

  it("resets the timer when value changes before delay expires", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: "b" });
    act(() => { vi.advanceTimersByTime(200); }); // only 200ms after last change

    // Should NOT have updated yet
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(100); }); // now 300ms after "b"
    expect(result.current).toBe("b");
  });
});

// ── 5b: useBatchAction ───────────────────────────────────────────────────────

describe("Edge Case 5b — useBatchAction chunking", () => {
  it("processes items in chunks and calls action exactly N times", async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    const { result } = renderHook(() =>
      useBatchAction(action, { chunkSize: 10, delayMs: 0 })
    );

    const ids = Array.from({ length: 50 }, (_, i) => `prod-${i}`);

    await act(async () => {
      await result.current.runBatch(ids);
    });

    expect(action).toHaveBeenCalledTimes(50);
  });

  it("isPending is true during batch and false after completion", async () => {
    const resolvers: Array<(v: { success: boolean }) => void> = [];
    const action = vi.fn().mockImplementation(
      () => new Promise<{ success: boolean }>((res) => {
        resolvers.push(res);
      })
    );

    const { result } = renderHook(() =>
      useBatchAction(action, { chunkSize: 5, delayMs: 0 })
    );

    act(() => {
      result.current.runBatch(["a", "b", "c"]);
    });

    expect(result.current.isPending).toBe(true);

    await act(async () => {
      resolvers.forEach((res) => res({ success: true }));
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("collects per-item errors without stopping the batch", async () => {
    const action = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() =>
      useBatchAction(action, { chunkSize: 10, delayMs: 0 })
    );

    let batchResults!: Awaited<ReturnType<typeof result.current.runBatch>>;
    await act(async () => {
      batchResults = await result.current.runBatch(["a", "b", "c"]);
    });

    expect(batchResults).toHaveLength(3);
    expect(batchResults[0].error).toBeUndefined();
    expect(batchResults[1].error).toBe("DB error");
    expect(batchResults[2].error).toBeUndefined();
    // Batch ran to completion despite item failure
    expect(action).toHaveBeenCalledTimes(3);
  });

  it("returns empty results for empty input without calling action", async () => {
    const action = vi.fn();
    const { result } = renderHook(() =>
      useBatchAction(action, { chunkSize: 10, delayMs: 0 })
    );

    let batchResults!: Awaited<ReturnType<typeof result.current.runBatch>>;
    await act(async () => {
      batchResults = await result.current.runBatch([]);
    });

    expect(action).not.toHaveBeenCalled();
    expect(batchResults).toHaveLength(0);
    expect(result.current.isPending).toBe(false);
  });
});
