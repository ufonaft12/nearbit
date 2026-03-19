/**
 * Tests for lib/langfuse/client.ts
 *
 * withTrace:
 *  - Passes a Langfuse trace object to the callback
 *  - Returns the callback's return value
 *  - Marks trace output status: "success" on completion
 *  - Marks trace output status: "error" + message on thrown Error
 *  - Re-throws the original error after tracing
 *  - Calls lf.flushAsync() on success
 *  - Calls lf.flushAsync() even when fn throws
 *  - Accepts optional metadata and passes it to lf.trace()
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Langfuse mock ─────────────────────────────────────────────────────────────

const mockTrace = {
  update: vi.fn(),
};
const mockLf = {
  trace: vi.fn().mockReturnValue(mockTrace),
  flushAsync: vi.fn().mockResolvedValue(undefined),
};

vi.mock("langfuse", () => ({
  Langfuse: vi.fn(function (this: Record<string, unknown>) {
    Object.assign(this, mockLf);
  }),
}));

// Import AFTER mock so the singleton picks up the mock constructor
import { withTrace } from "@/lib/langfuse/client";

beforeEach(() => vi.clearAllMocks());

// ── withTrace ─────────────────────────────────────────────────────────────────

describe("withTrace", () => {
  it("invokes the callback with the trace object", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await withTrace("my-op", fn);
    expect(fn).toHaveBeenCalledWith(mockTrace);
  });

  it("returns the callback's return value", async () => {
    const result = await withTrace("my-op", async () => 42);
    expect(result).toBe(42);
  });

  it("marks trace output status='success' when callback resolves", async () => {
    await withTrace("my-op", async () => "done");
    expect(mockTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.objectContaining({ status: "success" }) })
    );
  });

  it("calls lf.flushAsync() after success", async () => {
    await withTrace("my-op", async () => null);
    expect(mockLf.flushAsync).toHaveBeenCalledTimes(1);
  });

  it("marks trace output status='error' and includes message when fn throws", async () => {
    await expect(
      withTrace("my-op", async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");

    expect(mockTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ status: "error", error: "boom" }),
      })
    );
  });

  it("re-throws the original error after tracing", async () => {
    const err = new Error("critical");
    await expect(withTrace("my-op", async () => { throw err; })).rejects.toBe(err);
  });

  it("calls lf.flushAsync() even when fn throws (finally block)", async () => {
    await expect(
      withTrace("my-op", async () => { throw new Error("x"); })
    ).rejects.toThrow();
    expect(mockLf.flushAsync).toHaveBeenCalledTimes(1);
  });

  it("passes the name and metadata to lf.trace()", async () => {
    await withTrace("inventory-upload", async () => null, { source: "csv" });
    expect(mockLf.trace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "inventory-upload", metadata: { source: "csv" } })
    );
  });

  it("handles non-Error throws gracefully (String path)", async () => {
    await expect(
      withTrace("my-op", async () => { throw "string error"; })
    ).rejects.toBe("string error");

    expect(mockTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ status: "error", error: "string error" }),
      })
    );
  });
});
