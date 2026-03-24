/**
 * ProductsTable — search/filter integration tests.
 *
 * Uses fake timers to control the 200ms useDebounce delay, so we can assert
 * both the "mid-typing" state (filter not yet applied) and the "settled" state.
 *
 * Covers:
 *  - Shows all rows on initial render (no filter)
 *  - Filters by Hebrew name (exact substring)
 *  - Filters by Russian name (case-insensitive)
 *  - Filters by barcode
 *  - Clears filter when search input is emptied
 *  - Shows "No products found." when no rows match
 *  - Footer shows correct filtered/total count
 *  - Debounce: rows are NOT filtered mid-keystroke (before delay elapses)
 *  - Debounce: rows ARE filtered after 200 ms elapse
 *  - Select-all checkbox selects only visible (filtered) rows
 *  - Batch match market button appears only with 2+ selected rows + market data
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
// waitFor is only used in async (non-fake-timer) tests below
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import ProductsTable from "@/components/inventory/ProductsTable";
import { makeProduct, makeMarketComparison } from "./helpers/factories";

// Mock server action imported by ProductsTable
vi.mock("@/lib/actions/market", () => ({
  matchMarketPriceAction: vi.fn().mockResolvedValue({ success: true, newPrice: 9.9 }),
}));

function renderTable(
  products = [makeProduct()],
  marketData?: Record<string, ReturnType<typeof makeMarketComparison>>
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProductsTable products={products} marketData={marketData} />
    </NextIntlClientProvider>
  );
}

const P1 = makeProduct({
  id: "p1",
  pos_item_id: "pos1",
  name_he: "חלב טרי",
  name_ru: "Молоко свежее",
  barcode: "1234567890",
  price: 9.9,
});
const P2 = makeProduct({
  id: "p2",
  pos_item_id: "pos2",
  name_he: "גבינה צהובה",
  name_ru: "Жёлтый сыр",
  barcode: "9876543210",
  price: 25.0,
});
const P3 = makeProduct({
  id: "p3",
  pos_item_id: "pos3",
  name_he: "לחם אחיד",
  name_ru: "Хлеб белый",
  barcode: "1111111111",
  price: 8.5,
});

// ── Initial render ─────────────────────────────────────────────────────────────

describe("ProductsTable — initial render", () => {
  it("shows all products when no search term", () => {
    renderTable([P1, P2, P3]);
    expect(screen.getByText("חלב טרי")).toBeInTheDocument();
    expect(screen.getByText("גבינה צהובה")).toBeInTheDocument();
    expect(screen.getByText("לחם אחיד")).toBeInTheDocument();
  });

  it("footer shows total count with no filter", () => {
    renderTable([P1, P2, P3]);
    expect(screen.getByText("Showing 3 of 3 products")).toBeInTheDocument();
  });
});

// ── Filtering (with fake timers for debounce) ──────────────────────────────────

describe("ProductsTable — search filtering", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // NOTE: waitFor + fake timers deadlocks (waitFor polls via setTimeout which
  // never fires). Pattern: advance timers inside act(), then assert synchronously.

  it("filters by Hebrew name after debounce delay", () => {
    renderTable([P1, P2, P3]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "חלב" } });
    // Before delay: all rows still visible
    expect(screen.getByText("גבינה צהובה")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("חלב טרי")).toBeInTheDocument();
    expect(screen.queryByText("גבינה צהובה")).not.toBeInTheDocument();
    expect(screen.queryByText("לחם אחיד")).not.toBeInTheDocument();
  });

  it("filters by Russian name (case-insensitive) after debounce", () => {
    renderTable([P1, P2, P3]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "сыр" } });
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("Жёлтый сыр")).toBeInTheDocument();
    expect(screen.queryByText("Молоко свежее")).not.toBeInTheDocument();
  });

  it("filters by barcode after debounce", () => {
    renderTable([P1, P2, P3]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "9876543210" } });
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("גבינה צהובה")).toBeInTheDocument();
    expect(screen.queryByText("חלב טרי")).not.toBeInTheDocument();
  });

  it("shows all products when search is cleared", () => {
    renderTable([P1, P2]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "חלב" } });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("גבינה צהובה")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("חלב טרי")).toBeInTheDocument();
    expect(screen.getByText("גבינה צהובה")).toBeInTheDocument();
  });

  it("shows 'No products found.' when nothing matches", () => {
    renderTable([P1, P2, P3]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "xyzXYZ_no_match" } });
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("No products found.")).toBeInTheDocument();
  });

  it("footer count reflects the filtered result", () => {
    renderTable([P1, P2, P3]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "חלב" } });
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("Showing 1 of 3 products")).toBeInTheDocument();
  });

  it("does NOT filter before debounce delay elapses", () => {
    renderTable([P1, P2, P3]);
    const input = screen.getByPlaceholderText(/Search/i);

    fireEvent.change(input, { target: { value: "חלב" } });

    // Only 100ms elapsed — still within 200ms window
    act(() => vi.advanceTimersByTime(100));

    // All products still visible
    expect(screen.getByText("גבינה צהובה")).toBeInTheDocument();
    expect(screen.getByText("לחם אחיד")).toBeInTheDocument();
  });
});

// ── Selection behaviour ────────────────────────────────────────────────────────

describe("ProductsTable — selection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("select-all only selects filtered (visible) rows", () => {
    renderTable([P1, P2, P3], undefined);
    const input = screen.getByPlaceholderText(/Search/i);

    // Filter to 1 product then advance debounce
    fireEvent.change(input, { target: { value: "חלב" } });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText("חלב טרי")).toBeInTheDocument();

    // Click select-all
    const headerCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(headerCheckbox);

    // header + 1 visible row = 2 checkboxes, all checked
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });
});

// ── Batch match market button ──────────────────────────────────────────────────

describe("ProductsTable — batch match market button", () => {
  it("shows 'Batch match market' only when 2+ items selected AND market data present", async () => {
    const marketData = {
      p1: makeMarketComparison({ product_id: "p1", market_avg: 8.0 }),
      p2: makeMarketComparison({ product_id: "p2", market_avg: 20.0 }),
    };
    renderTable([P1, P2], marketData);

    // Select both items
    const [, cb1, cb2] = screen.getAllByRole("checkbox");
    fireEvent.click(cb1);
    fireEvent.click(cb2);

    await waitFor(() =>
      expect(screen.getByText(/Batch match market \(2\)/i)).toBeInTheDocument()
    );
  });

  it("does NOT show batch button with only 1 item selected", () => {
    const marketData = {
      p1: makeMarketComparison({ product_id: "p1" }),
    };
    renderTable([P1, P2], marketData);

    const [, cb1] = screen.getAllByRole("checkbox");
    fireEvent.click(cb1);

    expect(screen.queryByText(/Batch match market/i)).not.toBeInTheDocument();
  });

  it("does NOT show batch button when no market data available", () => {
    renderTable([P1, P2], undefined);

    const [, cb1, cb2] = screen.getAllByRole("checkbox");
    fireEvent.click(cb1);
    fireEvent.click(cb2);

    expect(screen.queryByText(/Batch match market/i)).not.toBeInTheDocument();
  });
});
