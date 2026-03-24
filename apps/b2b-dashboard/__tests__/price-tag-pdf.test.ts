/**
 * Tests for generatePriceTagPDF and downloadPDF (lib/utils/price-tag-pdf.ts)
 *
 * jsPDF uses canvas/font APIs unavailable in jsdom, so we mock the module.
 * We test orchestration logic (what gets called with what args).
 *
 * Covers:
 *  - Returns a Blob (basic contract)
 *  - Empty products array → no product loop, still returns Blob
 *  - Product with null price → price text is "—"
 *  - Product with sale_price → sale badge drawn
 *  - Product with no barcode → falls back to product.id for QR
 *  - QR generation failure → fallback placeholder drawn
 *  - Page break triggers addPage for > page capacity products
 *  - downloadPDF creates an <a> and clicks it
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeProduct } from "./helpers/factories";

// ── Mocks (hoisted — must not reference outer-scope let/const) ────────────────

vi.mock("jspdf", () => {
  // Must use regular function so `new` works correctly
  const MockJsPDF = vi.fn(function (this: Record<string, unknown>) {
    this.setDrawColor = vi.fn();
    this.setLineWidth = vi.fn();
    this.roundedRect = vi.fn();
    this.setFontSize = vi.fn();
    this.setFont = vi.fn();
    this.setTextColor = vi.fn();
    this.text = vi.fn();
    this.setFillColor = vi.fn();
    this.addPage = vi.fn();
    this.addImage = vi.fn();
    this.rect = vi.fn();
    this.output = vi
      .fn()
      .mockReturnValue(new Blob(["pdf"], { type: "application/pdf" }));
  });
  return { default: MockJsPDF };
});

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fakeQR"),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import jsPDF from "jspdf";
import QRCode from "qrcode";
import { generatePriceTagPDF, downloadPDF } from "@/lib/utils/price-tag-pdf";

/** Get the jsPDF instance created during the last generatePriceTagPDF call */
function getDoc() {
  const results = vi.mocked(jsPDF).mock.results;
  return results[results.length - 1].value as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── generatePriceTagPDF — basic contract ──────────────────────────────────────

describe("generatePriceTagPDF — basic contract", () => {
  it("returns a Blob", async () => {
    const blob = await generatePriceTagPDF({
      products: [makeProduct()],
      storeName: "Test Store",
    });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("returns a Blob for an empty products array (no crash)", async () => {
    const blob = await generatePriceTagPDF({ products: [], storeName: "Test" });
    expect(blob).toBeInstanceOf(Blob);
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
  });
});

// ── generatePriceTagPDF — price text ─────────────────────────────────────────

describe("generatePriceTagPDF — price text", () => {
  it("renders the regular price as ₪X.XX when no sale_price", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ price: 12.5, sale_price: null })],
      storeName: "S",
    });
    const textCalls = getDoc().text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("₪12.50");
  });

  it("renders sale_price instead of regular price when set", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ price: 20.0, sale_price: 15.0 })],
      storeName: "S",
    });
    const textCalls = getDoc().text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("₪15.00");
  });

  it("renders '—' when both price and sale_price are null", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ price: null, sale_price: null })],
      storeName: "S",
    });
    const textCalls = getDoc().text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("—");
  });
});

// ── generatePriceTagPDF — sale badge ─────────────────────────────────────────

describe("generatePriceTagPDF — sale badge", () => {
  it("draws the red sale badge when sale_price is set", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ price: 20.0, sale_price: 15.0 })],
      storeName: "S",
    });
    const doc = getDoc();
    expect(doc.setFillColor).toHaveBeenCalledWith(239, 68, 68);
    // roundedRect(x, y, w, h, rx, ry, style) — "F" fill mode is at index 6
    const fillRect = doc.roundedRect.mock.calls.find(
      (c: unknown[]) => c[6] === "F"
    );
    expect(fillRect).toBeDefined();
  });

  it("does NOT draw the red sale badge when sale_price is null", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ price: 20.0, sale_price: null })],
      storeName: "S",
    });
    expect(getDoc().setFillColor).not.toHaveBeenCalledWith(239, 68, 68);
  });
});

// ── generatePriceTagPDF — QR code ────────────────────────────────────────────

describe("generatePriceTagPDF — QR code", () => {
  it("uses barcode as QR value when present", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ barcode: "9876543210" })],
      storeName: "S",
    });
    expect(QRCode.toDataURL).toHaveBeenCalledWith("9876543210", expect.any(Object));
  });

  it("falls back to product.id when barcode is null", async () => {
    await generatePriceTagPDF({
      products: [makeProduct({ id: "uuid-abc", barcode: null })],
      storeName: "S",
    });
    expect(QRCode.toDataURL).toHaveBeenCalledWith("uuid-abc", expect.any(Object));
  });

  it("draws a placeholder rect + 'QR' text when QR generation fails", async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error("QR fail"));
    await generatePriceTagPDF({
      products: [makeProduct({ barcode: "111" })],
      storeName: "S",
    });
    const doc = getDoc();
    expect(doc.rect).toHaveBeenCalled();
    const textCalls = doc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("QR");
    expect(doc.addImage).not.toHaveBeenCalled();
  });
});

// ── generatePriceTagPDF — pagination ─────────────────────────────────────────

describe("generatePriceTagPDF — pagination", () => {
  it("calls addPage when products exceed one page capacity", async () => {
    // rows = floor((297 - 10*2) / 54) = floor(277/54) = 5
    // cols = 2 → page capacity = 5 × 2 = 10 tags → 11 products triggers addPage
    const products = Array.from({ length: 11 }, (_, i) =>
      makeProduct({ id: `p${i}`, pos_item_id: `pos${i}` })
    );
    await generatePriceTagPDF({ products, storeName: "S" });
    expect(getDoc().addPage).toHaveBeenCalledTimes(1);
  });

  it("does NOT call addPage when products fit on one page", async () => {
    const products = Array.from({ length: 4 }, (_, i) =>
      makeProduct({ id: `p${i}`, pos_item_id: `pos${i}` })
    );
    await generatePriceTagPDF({ products, storeName: "S" });
    expect(getDoc().addPage).not.toHaveBeenCalled();
  });
});

// ── downloadPDF ───────────────────────────────────────────────────────────────

describe("downloadPDF", () => {
  it("creates an <a>, sets href + download, clicks it, and revokes the URL", () => {
    const clickSpy = vi.fn();
    const mockAnchor = { href: "", download: "", click: clickSpy };
    vi.spyOn(document, "createElement").mockReturnValueOnce(
      mockAnchor as unknown as HTMLAnchorElement
    );
    const fakeUrl = "blob:http://localhost/fake";
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue(fakeUrl),
      revokeObjectURL: vi.fn(),
    });

    downloadPDF(new Blob(["pdf"]), "my-tags.pdf");

    expect(mockAnchor.href).toBe(fakeUrl);
    expect(mockAnchor.download).toBe("my-tags.pdf");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(fakeUrl);

    vi.unstubAllGlobals();
  });

  it("defaults to 'price-tags.pdf' when no filename provided", () => {
    const mockAnchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValueOnce(
      mockAnchor as unknown as HTMLAnchorElement
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:test"),
      revokeObjectURL: vi.fn(),
    });

    downloadPDF(new Blob());
    expect(mockAnchor.download).toBe("price-tags.pdf");

    vi.unstubAllGlobals();
  });
});
