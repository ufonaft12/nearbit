/**
 * Edge Case 1: Supabase RPC returns null or an empty array for market data.
 *
 * The inventory page passes marketData={} or marketData={undefined} to
 * ProductsTable. The table must render gracefully without crashing and must
 * hide the "Market Comparison" column entirely.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductsTable from "@/components/inventory/ProductsTable";
import { makeProduct } from "./helpers/factories";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// next-intl requires a provider even in tests
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("Edge Case 1 — No market data (RPC returns null/empty)", () => {
  const products = [makeProduct({ id: "p1" }), makeProduct({ id: "p2" })];

  it("renders the table without Market Comparison column when marketData is undefined", () => {
    renderWithIntl(<ProductsTable products={products} marketData={undefined} />);
    expect(screen.queryByText(/Market Comparison/i)).not.toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 2 products")).toBeInTheDocument();
  });

  it("renders the table without Market Comparison column when marketData is empty object", () => {
    renderWithIntl(<ProductsTable products={products} marketData={{}} />);
    expect(screen.queryByText(/Market Comparison/i)).not.toBeInTheDocument();
  });

  it("does not show the 'Price 10%+ above market' legend when there is no market data", () => {
    renderWithIntl(<ProductsTable products={products} marketData={{}} />);
    expect(screen.queryByText(/Price 10\+/i)).not.toBeInTheDocument();
  });

  it("shows 'No products found' when both products array and market data are empty", () => {
    renderWithIntl(<ProductsTable products={[]} marketData={{}} />);
    expect(screen.getByText("No products found.")).toBeInTheDocument();
  });

  it("renders normally when products array is empty and marketData has entries", () => {
    // Shouldn't crash even if marketData references non-existent product ids
    renderWithIntl(
      <ProductsTable
        products={[]}
        marketData={{ "ghost-id": { product_id: "ghost-id", best_price: 5, best_chain: null, market_avg: 5, competitor_count: 1, competitors: [] } }}
      />
    );
    expect(screen.getByText("No products found.")).toBeInTheDocument();
  });
});
