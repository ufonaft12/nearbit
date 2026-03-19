/**
 * Tests for lib/actions/inventory.ts — uploadInventoryAction
 *
 * Covers:
 *  - No file in formData → { inserted:0, skipped:0, errors:["No file provided."] }
 *  - Empty file (size 0) → same error
 *  - Parse error from parseUploadedFile → { errors:["File parse error: ..."] }
 *  - File with no valid rows → { errors:["File contained no valid rows."] }
 *  - No authenticated user → { errors:["...Unauthorized..."] }
 *  - No store for user → { errors:["...No store found..."] }
 *  - Successful upsert → { inserted: N, skipped: 0, errors: [] }
 *  - Upsert DB error → { inserted: 0, skipped: N, errors: [...] }
 *  - Batch chunking: 150 rows split into 2 chunks of ≤100
 *  - derivePosItemId: barcode used when present, slug from name_he otherwise
 *  - Calls revalidatePath("/business/inventory") on success
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockSupabase, mockTrace, mockLf, mockParseUploadedFile } = vi.hoisted(() => {
  const upsertChain = {
    upsert: vi.fn().mockResolvedValue({ error: null, count: 1 }),
  };
  const categoriesChain = {
    select: vi.fn().mockResolvedValue({ data: [] }),
  };
  const storeChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "store-123" } }),
  };

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "stores") return storeChain;
      if (table === "categories") return categoriesChain;
      if (table === "products") return upsertChain;
      return {};
    }),
    _storeChain: storeChain,
    _upsertChain: upsertChain,
    _categoriesChain: categoriesChain,
  };

  const mockSpan = { end: vi.fn() };
  const mockGeneration = { end: vi.fn() };
  const mockTrace = {
    update: vi.fn(),
    span: vi.fn().mockReturnValue(mockSpan),
    generation: vi.fn().mockReturnValue(mockGeneration), // smartMapCategories calls trace.generation()
  };
  const mockLf = {
    trace: vi.fn().mockReturnValue(mockTrace),
    flushAsync: vi.fn().mockResolvedValue(undefined),
  };

  const mockParseUploadedFile = vi.fn();

  return { mockSupabase, mockTrace, mockLf, mockParseUploadedFile };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("langfuse", () => ({
  Langfuse: vi.fn(function (this: Record<string, unknown>) {
    Object.assign(this, mockLf);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/utils/excel-parser", () => ({
  parseUploadedFile: mockParseUploadedFile,
}));

// ── SUT import ────────────────────────────────────────────────────────────────

import { uploadInventoryAction } from "@/lib/actions/inventory";
import { revalidatePath } from "next/cache";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFormData(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return fd;
}

function makeCSVFile(content = "name_he,price\nחלב,9.9") {
  return new File([content], "products.csv", { type: "text/csv" });
}

function makeRow(overrides = {}) {
  return { name_he: "חלב", price: 9.9, barcode: "111", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Reset supabase chain defaults
  mockSupabase._storeChain.select.mockReturnThis();
  mockSupabase._storeChain.eq.mockReturnThis();
  mockSupabase._storeChain.single.mockResolvedValue({ data: { id: "store-123" } });
  mockSupabase._categoriesChain.select.mockResolvedValue({ data: [] });
  mockSupabase._upsertChain.upsert.mockResolvedValue({ error: null, count: 1 });
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "stores") return mockSupabase._storeChain;
    if (table === "categories") return mockSupabase._categoriesChain;
    if (table === "products") return mockSupabase._upsertChain;
    return {};
  });

  mockLf.trace.mockReturnValue(mockTrace);
  mockLf.flushAsync.mockResolvedValue(undefined);
  mockTrace.span.mockReturnValue({ end: vi.fn() });

  mockParseUploadedFile.mockResolvedValue([makeRow()]);
});

// ── Guard checks ──────────────────────────────────────────────────────────────

describe("uploadInventoryAction — guard checks", () => {
  it("returns error when no file is in formData", async () => {
    const result = await uploadInventoryAction(makeFormData(null));
    expect(result).toEqual({ inserted: 0, skipped: 0, errors: ["No file provided."] });
  });

  it("returns error when file size is 0", async () => {
    const emptyFile = new File([], "empty.csv", { type: "text/csv" });
    const result = await uploadInventoryAction(makeFormData(emptyFile));
    expect(result).toEqual({ inserted: 0, skipped: 0, errors: ["No file provided."] });
  });
});

// ── Parse errors ──────────────────────────────────────────────────────────────

describe("uploadInventoryAction — parse errors", () => {
  it("returns file parse error when parseUploadedFile throws", async () => {
    mockParseUploadedFile.mockRejectedValue(new Error("bad format"));
    const result = await uploadInventoryAction(makeFormData(makeCSVFile()));
    expect(result.errors[0]).toMatch(/File parse error/);
    expect(result.inserted).toBe(0);
  });

  it("returns 'no valid rows' error when parser returns empty array", async () => {
    mockParseUploadedFile.mockResolvedValue([]);
    const result = await uploadInventoryAction(makeFormData(makeCSVFile()));
    expect(result.errors).toContain("File contained no valid rows.");
  });
});

// ── Auth / store errors ───────────────────────────────────────────────────────

describe("uploadInventoryAction — auth and store errors", () => {
  it("returns error when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await uploadInventoryAction(makeFormData(makeCSVFile()));
    expect(result.errors[0]).toMatch(/Unauthorized/);
  });

  it("returns error when no store is found for the user", async () => {
    mockSupabase._storeChain.single.mockResolvedValue({ data: null });
    const result = await uploadInventoryAction(makeFormData(makeCSVFile()));
    expect(result.errors[0]).toMatch(/No store found/);
  });
});

// ── Successful upsert ─────────────────────────────────────────────────────────

describe("uploadInventoryAction — successful upsert", () => {
  it("returns inserted count and empty errors on success", async () => {
    mockParseUploadedFile.mockResolvedValue([makeRow(), makeRow({ name_he: "גבינה", price: 20 })]);
    mockSupabase._upsertChain.upsert.mockResolvedValue({ error: null, count: 2 });

    const result = await uploadInventoryAction(makeFormData(makeCSVFile()));

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("calls revalidatePath('/business/inventory') on success", async () => {
    await uploadInventoryAction(makeFormData(makeCSVFile()));
    expect(revalidatePath).toHaveBeenCalledWith("/business/inventory");
  });

  it("uses barcode as pos_item_id when present", async () => {
    mockParseUploadedFile.mockResolvedValue([makeRow({ barcode: "9876543" })]);

    await uploadInventoryAction(makeFormData(makeCSVFile()));

    const upsertCall = mockSupabase._upsertChain.upsert.mock.calls[0][0];
    expect(upsertCall[0].pos_item_id).toBe("9876543");
  });

  it("generates a slug pos_item_id from name_he when barcode is absent", async () => {
    mockParseUploadedFile.mockResolvedValue([makeRow({ barcode: undefined, name_he: "חלב 3%" })]);

    await uploadInventoryAction(makeFormData(makeCSVFile()));

    const upsertCall = mockSupabase._upsertChain.upsert.mock.calls[0][0];
    expect(upsertCall[0].pos_item_id).toMatch(/^b2b:/);
  });

  it("maps known category name to category_id", async () => {
    mockSupabase._categoriesChain.select.mockResolvedValue({
      data: [{ id: "cat-dairy", name_en: "Dairy" }],
    });
    mockParseUploadedFile.mockResolvedValue([makeRow({ category: "dairy" })]);

    await uploadInventoryAction(makeFormData(makeCSVFile()));

    const row = mockSupabase._upsertChain.upsert.mock.calls[0][0][0];
    expect(row.category_id).toBe("cat-dairy");
  });
});

// ── DB errors ────────────────────────────────────────────────────────────────

describe("uploadInventoryAction — DB upsert errors", () => {
  it("accumulates errors and increments skipped when upsert fails", async () => {
    mockParseUploadedFile.mockResolvedValue([makeRow(), makeRow({ name_he: "לחם", price: 8 })]);
    mockSupabase._upsertChain.upsert.mockResolvedValue({
      error: { message: "constraint violation" },
      count: null,
    });

    const result = await uploadInventoryAction(makeFormData(makeCSVFile()));

    expect(result.skipped).toBe(2);
    expect(result.errors[0]).toMatch(/constraint violation/);
  });
});

// ── Batch chunking ────────────────────────────────────────────────────────────

describe("uploadInventoryAction — batch chunking", () => {
  it("splits 150 rows into 2 upsert calls (chunks of 100)", async () => {
    const rows = Array.from({ length: 150 }, (_, i) =>
      makeRow({ name_he: `מוצר ${i}`, barcode: `bar${i}` })
    );
    mockParseUploadedFile.mockResolvedValue(rows);
    mockSupabase._upsertChain.upsert.mockResolvedValue({ error: null, count: 100 });

    await uploadInventoryAction(makeFormData(makeCSVFile()));

    expect(mockSupabase._upsertChain.upsert).toHaveBeenCalledTimes(2);
    // First chunk = 100 rows
    expect(mockSupabase._upsertChain.upsert.mock.calls[0][0]).toHaveLength(100);
    // Second chunk = 50 rows
    expect(mockSupabase._upsertChain.upsert.mock.calls[1][0]).toHaveLength(50);
  });
});
