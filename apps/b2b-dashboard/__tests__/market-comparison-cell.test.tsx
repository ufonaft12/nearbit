/**
 * Tests for components/inventory/MarketComparisonCell.tsx
 *
 * formatStaleness (pure function — accessed via rendered output):
 *  - < 1 hour  → "< 1h ago"
 *  - 2 hours   → "2h ago"
 *  - yesterday → "yesterday"
 *  - 3 days    → "3d ago"
 *  - 2 weeks   → "2w ago"
 *  - null/undefined → label not shown
 *
 * Component behaviour:
 *  - No comparison or null ourPrice → renders "—" placeholder
 *  - With comparison: shows best price and delta
 *  - Price above market → red delta + TrendingUp icon + "Match" button
 *  - Price below market → green delta + no "Match" button
 *  - "Match" button is disabled while pending
 *  - Successful matchMarketPriceAction → no error shown
 *  - Failed matchMarketPriceAction → "!" error indicator shown
 *  - Popover hidden on initial render
 *  - Popover shown after chevron button click
 *  - Popover closes when clicking outside the component
 *  - Popover shows competitor count and market average
 *  - aboveAvgPct shown in popover when price is above average
 *  - Staleness label shown in popover
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import MarketComparisonCell from "@/components/inventory/MarketComparisonCell";
import type { MarketComparison } from "@/lib/actions/market";

// ── Mock ──────────────────────────────────────────────────────────────────────

const { mockMatchMarket } = vi.hoisted(() => ({
  mockMatchMarket: vi.fn().mockResolvedValue({ success: true, newPrice: 9.0 }),
}));

vi.mock("@/lib/actions/market", () => ({
  matchMarketPriceAction: mockMatchMarket,
}));

beforeEach(() => vi.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}
function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

function makeComparison(overrides: Partial<MarketComparison> = {}): MarketComparison {
  return {
    product_id: "p1",
    best_price: 8.0,
    market_avg: 9.0,
    competitor_count: 3,
    competitors: [
      { chain: "Rami Levy", city: "Beer Sheva", price: 8.0, price_updated_at: hoursAgo(2) },
      { chain: "Shufersal", city: "Tel Aviv", price: 9.0, price_updated_at: hoursAgo(25) },
      { chain: "Victory", city: "Haifa", price: 10.0, price_updated_at: daysAgo(3) },
    ],
    ...overrides,
  };
}

function renderCell(
  ourPrice: number | null,
  comparison?: MarketComparison
) {
  return render(
    <MarketComparisonCell productId="p1" ourPrice={ourPrice} comparison={comparison} />
  );
}

// ── Placeholder ───────────────────────────────────────────────────────────────

describe("MarketComparisonCell — placeholder", () => {
  it("renders '—' when comparison is undefined", () => {
    renderCell(10.0, undefined);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders '—' when ourPrice is null", () => {
    renderCell(null, makeComparison());
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ── Delta display ─────────────────────────────────────────────────────────────

describe("MarketComparisonCell — delta display", () => {
  it("shows best_price", () => {
    renderCell(10.0, makeComparison({ best_price: 8.0 }));
    expect(screen.getByText("best ₪8.00")).toBeInTheDocument();
  });

  it("shows positive delta with '+' prefix when above market best", () => {
    renderCell(10.0, makeComparison({ best_price: 8.0 }));
    expect(screen.getByText("+2.00₪")).toBeInTheDocument();
  });

  it("shows negative delta without '+' when below market best", () => {
    renderCell(7.0, makeComparison({ best_price: 8.0 }));
    expect(screen.getByText("-1.00₪")).toBeInTheDocument();
  });
});

// ── Match button ──────────────────────────────────────────────────────────────

describe("MarketComparisonCell — Match button", () => {
  it("shows 'Match' button when ourPrice is above best_price", () => {
    renderCell(12.0, makeComparison({ best_price: 8.0 }));
    expect(screen.getByRole("button", { name: /Match/i })).toBeInTheDocument();
  });

  it("hides 'Match' button when ourPrice is below best_price", () => {
    renderCell(6.0, makeComparison({ best_price: 8.0 }));
    expect(screen.queryByRole("button", { name: /Match/i })).not.toBeInTheDocument();
  });

  it("calls matchMarketPriceAction with productId on click", async () => {
    renderCell(12.0, makeComparison());
    fireEvent.click(screen.getByRole("button", { name: /Match/i }));
    await waitFor(() => expect(mockMatchMarket).toHaveBeenCalledWith("p1"));
  });

  it("disables 'Match' button while action is pending", async () => {
    mockMatchMarket.mockImplementation(() => new Promise(() => {})); // never resolves
    renderCell(12.0, makeComparison());
    fireEvent.click(screen.getByRole("button", { name: /Match/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Match/i })).toBeDisabled()
    );
  });

  it("shows '!' error indicator when matchMarketPriceAction fails", async () => {
    mockMatchMarket.mockResolvedValue({ success: false, error: "DB error" });
    renderCell(12.0, makeComparison());
    fireEvent.click(screen.getByRole("button", { name: /Match/i }));
    await waitFor(() => expect(screen.getByTitle("DB error")).toBeInTheDocument());
  });

  it("does NOT show '!' when action succeeds", async () => {
    mockMatchMarket.mockResolvedValue({ success: true, newPrice: 8.9 });
    renderCell(12.0, makeComparison());
    fireEvent.click(screen.getByRole("button", { name: /Match/i }));
    await waitFor(() => expect(mockMatchMarket).toHaveBeenCalled());
    expect(screen.queryByTitle(/error/i)).not.toBeInTheDocument();
  });
});

// ── Popover ───────────────────────────────────────────────────────────────────

describe("MarketComparisonCell — popover", () => {
  it("popover is hidden on initial render", () => {
    renderCell(10.0, makeComparison());
    expect(screen.queryByText("Market average")).not.toBeInTheDocument();
  });

  it("opens popover when chevron button is clicked", () => {
    renderCell(10.0, makeComparison());
    const chevron = screen.getByTitle("View competitor details");
    fireEvent.click(chevron);
    expect(screen.getByText("Market average")).toBeInTheDocument();
  });

  it("closes popover when chevron is clicked again", () => {
    renderCell(10.0, makeComparison());
    const chevron = screen.getByTitle("View competitor details");
    fireEvent.click(chevron);
    fireEvent.click(chevron);
    expect(screen.queryByText("Market average")).not.toBeInTheDocument();
  });

  it("closes popover when clicking outside the component", () => {
    renderCell(10.0, makeComparison());
    fireEvent.click(screen.getByTitle("View competitor details"));
    expect(screen.getByText("Market average")).toBeInTheDocument();

    // Click outside the component
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Market average")).not.toBeInTheDocument();
  });

  it("shows competitor count in popover", () => {
    renderCell(10.0, makeComparison({ competitor_count: 5 }));
    fireEvent.click(screen.getByTitle("View competitor details"));
    expect(screen.getByText(/5 competitors/)).toBeInTheDocument();
  });

  it("uses singular 'competitor' for count 1", () => {
    renderCell(10.0, makeComparison({ competitor_count: 1 }));
    fireEvent.click(screen.getByTitle("View competitor details"));
    expect(screen.getByText("1 competitor")).toBeInTheDocument();
  });

  it("shows market average in popover", () => {
    renderCell(10.0, makeComparison({ market_avg: 9.5 }));
    fireEvent.click(screen.getByTitle("View competitor details"));
    expect(screen.getByText("₪9.50")).toBeInTheDocument();
  });

  it("shows '+X% avg' badge when ourPrice is above market_avg", () => {
    // ourPrice 12, market_avg 10 → +20%
    renderCell(12.0, makeComparison({ market_avg: 10.0, best_price: 8.0 }));
    fireEvent.click(screen.getByTitle("View competitor details"));
    expect(screen.getByText(/\+20% avg/)).toBeInTheDocument();
  });

  it("shows '-X% avg' badge when ourPrice is below market_avg", () => {
    // ourPrice 8, market_avg 10 → -20%
    renderCell(8.0, makeComparison({ market_avg: 10.0, best_price: 9.0 }));
    fireEvent.click(screen.getByTitle("View competitor details"));
    expect(screen.getByText(/-20% avg/)).toBeInTheDocument();
  });
});

// ── formatStaleness (via rendered popover) ────────────────────────────────────

describe("MarketComparisonCell — staleness labels", () => {
  function renderWithStaleness(updatedAt: string | null) {
    const comparison = makeComparison({
      competitors: [
        {
          chain: "Test",
          city: "City",
          price: 8.0,
          price_updated_at: updatedAt,
        },
      ],
    });
    renderCell(10.0, comparison);
    fireEvent.click(screen.getByTitle("View competitor details"));
  }

  // The staleness label appears twice: in the popover header AND the competitor row.
  // Use getAllByText and assert at least one match.

  it("shows '< 1h ago' for updates less than 1 hour old", () => {
    renderWithStaleness(hoursAgo(0.5));
    expect(screen.getAllByText(/< 1h ago/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Xh ago' for updates between 1h and 24h", () => {
    renderWithStaleness(hoursAgo(3));
    expect(screen.getAllByText(/3h ago/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'yesterday' for updates ~1 day old", () => {
    renderWithStaleness(daysAgo(1));
    expect(screen.getAllByText(/yesterday/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Xd ago' for updates between 2-6 days old", () => {
    renderWithStaleness(daysAgo(4));
    expect(screen.getAllByText(/4d ago/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Xw ago' for updates 7+ days old", () => {
    renderWithStaleness(daysAgo(14));
    expect(screen.getAllByText(/2w ago/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows no staleness label when price_updated_at is null", () => {
    renderWithStaleness(null);
    // no "ago" text should appear for this competitor row
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });
});
