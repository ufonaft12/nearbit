/**
 * Edge Case 3: AI matching confidence score is extremely low (near 0).
 *
 * The market-matcher uses pgvector similarity + LLM cross-check.
 * When confidence < 0.5 the match should NOT be used, and
 * MarketComparisonCell should fall back to "—" rather than showing
 * misleading price comparisons.
 *
 * This tests the MarketComparisonCell display contract:
 *   • comparison = undefined  →  renders "—"
 *   • comparison present but market_avg = 0  →  renders best price but no %
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MarketComparisonCell from "@/components/inventory/MarketComparisonCell";
import { makeMarketComparison } from "./helpers/factories";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("Edge Case 3 — Low AI confidence / missing market data", () => {
  it("renders '—' when comparison is undefined (match was below confidence threshold)", () => {
    renderWithIntl(
      <MarketComparisonCell
        productId="p1"
        ourPrice={12.0}
        comparison={undefined}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders '—' when ourPrice is null (product price not set)", () => {
    const comparison = makeMarketComparison();
    renderWithIntl(
      <MarketComparisonCell
        productId="p1"
        ourPrice={null}
        comparison={comparison}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows best price when comparison exists but market_avg is 0 (no avg data)", () => {
    const comparison = makeMarketComparison({ market_avg: 0 });
    renderWithIntl(
      <MarketComparisonCell
        productId="p1"
        ourPrice={12.0}
        comparison={comparison}
      />
    );
    // Best price should still render
    expect(screen.getByText(/best ₪/)).toBeInTheDocument();
  });

  it("does NOT show the Match button when our price is already at/below best price", () => {
    // Our price ≤ market best → not above market → no Match button
    const comparison = makeMarketComparison({ best_price: 15.0, market_avg: 13.0 });
    renderWithIntl(
      <MarketComparisonCell
        productId="p1"
        ourPrice={10.0}
        comparison={comparison}
      />
    );
    expect(screen.queryByRole("button", { name: /Match/i })).not.toBeInTheDocument();
  });

  it("shows Match button and delta when our price is above market best", () => {
    const comparison = makeMarketComparison({ best_price: 8.0, market_avg: 9.0 });
    renderWithIntl(
      <MarketComparisonCell
        productId="p1"
        ourPrice={12.0}
        comparison={comparison}
      />
    );
    expect(screen.getByRole("button", { name: /Match/i })).toBeInTheDocument();
    expect(screen.getByText(/\+4\.00₪/)).toBeInTheDocument();
  });
});
