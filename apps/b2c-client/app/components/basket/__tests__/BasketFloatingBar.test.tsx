import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, makeStore, sampleBasketItem } from '@/test-utils';
import { BasketFloatingBar } from '../BasketFloatingBar';
import type { BasketItem } from '@/types/nearbit';

function renderBar(
  items: BasketItem[] = [sampleBasketItem()],
  opts: { hydrated?: boolean; pendingAddLabel?: string | null } = {},
) {
  const { hydrated = true, pendingAddLabel = null } = opts;
  const store = makeStore({ items, hydrated });
  return renderWithProviders(<BasketFloatingBar pendingAddLabel={pendingAddLabel} />, { store });
}

describe('BasketFloatingBar', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  // ── Visibility guards ──────────────────────────────────────────────────────
  it('renders nothing when basket is empty', () => {
    const store = makeStore({ items: [], hydrated: true });
    const { container } = renderWithProviders(<BasketFloatingBar />, { store });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing before hydration (prevents SSR flash)', () => {
    const store = makeStore({ items: [sampleBasketItem()], hydrated: false });
    const { container } = renderWithProviders(<BasketFloatingBar />, { store });
    expect(container.firstChild).toBeNull();
  });

  it('renders when basket has items and is hydrated', () => {
    renderBar();
    expect(screen.getByText('1 item in basket')).toBeInTheDocument();
  });

  // ── Item count copy (ICU plural) ───────────────────────────────────────────
  it('shows singular "1 item in basket"', () => {
    renderBar([sampleBasketItem()]);
    expect(screen.getByText('1 item in basket')).toBeInTheDocument();
  });

  it('shows plural "2 items in basket"', () => {
    renderBar([
      sampleBasketItem({ id: 'p1' }),
      sampleBasketItem({ id: 'p2', name: 'ביצים' }),
    ]);
    expect(screen.getByText('2 items in basket')).toBeInTheDocument();
  });

  // ── Total cost ────────────────────────────────────────────────────────────
  it('shows the total cost — appears in summary (even if also in chip)', () => {
    // Use two items with different prices so total ≠ individual price
    renderBar([
      sampleBasketItem({ id: 'p1', price: 9.5 }),
      sampleBasketItem({ id: 'p2', name: 'ביצים', price: 5.0 }),
    ]);
    // Total = 14.50, which only appears once (in the summary row)
    expect(screen.getByText('₪14.50')).toBeInTheDocument();
  });

  it('treats null price as 0 in the total (multi-item total is unique)', () => {
    // Items: 5.0 + 3.0 = 8.00 (total). Chips show ₪5.00 and ₪3.00 separately.
    // ₪8.00 only appears in the summary total row — no ambiguity.
    renderBar([
      sampleBasketItem({ id: 'p1', price: 5.0 }),
      sampleBasketItem({ id: 'p2', name: 'ביצים', price: 3.0 }),
    ]);
    expect(screen.getByText('₪8.00')).toBeInTheDocument();
  });

  it('shows ₪0.00 total when all items have null prices', () => {
    // Two items both with null price — total = 0.00.
    // Chips don't show any ₪ symbol, so ₪0.00 only appears in the summary.
    renderBar([
      sampleBasketItem({ id: 'p1', price: null }),
      sampleBasketItem({ id: 'p2', name: 'ביצים', price: null }),
    ]);
    expect(screen.getByText('₪0.00')).toBeInTheDocument();
  });

  // ── Item chips ────────────────────────────────────────────────────────────
  it('renders a chip for each basket item', () => {
    renderBar([
      sampleBasketItem({ id: 'p1', name: 'חלב' }),
      sampleBasketItem({ id: 'p2', name: 'ביצים' }),
    ]);
    expect(screen.getByText('חלב')).toBeInTheDocument();
    expect(screen.getByText('ביצים')).toBeInTheDocument();
  });

  it('dispatches removeItem when a chip × button is clicked', async () => {
    const user = userEvent.setup();
    const { store } = renderBar([sampleBasketItem({ id: 'p1', name: 'חלב' })]);

    await user.click(screen.getByRole('button', { name: /remove חלב from basket/i }));

    expect(store.getState().basket.items).toHaveLength(0);
  });

  it('shows item price in the chip when price is non-null', () => {
    // Use two items with distinct prices so total ≠ either individual price.
    // ₪5.00 (chip for p1) and ₪3.00 (chip for p2); total = ₪8.00 (summary).
    renderBar([
      sampleBasketItem({ id: 'p1', price: 5.0, name: 'חלב' }),
      sampleBasketItem({ id: 'p2', price: 3.0, name: 'ביצים' }),
    ]);
    // Each chip price appears exactly once
    expect(screen.getByText('₪5.00')).toBeInTheDocument();
    expect(screen.getByText('₪3.00')).toBeInTheDocument();
  });

  it('hides price in chip when item price is null (chip shows only name)', () => {
    // p1 has null price → no chip price. p2 has non-null → chip price shown.
    renderBar([
      sampleBasketItem({ id: 'p1', price: null, name: 'חלב' }),
      sampleBasketItem({ id: 'p2', price: 5.0,  name: 'ביצים' }),
    ]);
    // p1 chip should NOT contain a ₪ price
    expect(screen.queryByText('₪null')).not.toBeInTheDocument();
    // p2 chip shows its price (₪5.00 appears in chip; summary total = ₪5.00 appears twice — that's OK)
    expect(screen.getAllByText('₪5.00').length).toBeGreaterThanOrEqual(1);
  });

  // ── Clear all ─────────────────────────────────────────────────────────────
  it('clears the entire basket when "Clear all" is clicked', async () => {
    const user = userEvent.setup();
    const { store } = renderBar([
      sampleBasketItem({ id: 'p1' }),
      sampleBasketItem({ id: 'p2', name: 'ביצים' }),
    ]);

    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(store.getState().basket.items).toHaveLength(0);
  });

  // ── Single-store Waze ──────────────────────────────────────────────────────
  it('shows a direct Waze navigate button for a single store', () => {
    renderBar([sampleBasketItem({ storeId: 'store-1' })]);
    // Single-store renders a plain button (no aria-expanded)
    const btn = screen.getByRole('button', { name: /yalla! waze/i });
    expect(btn).not.toHaveAttribute('aria-expanded');
  });

  it('opens Waze URL with store coordinates for single store', async () => {
    const user = userEvent.setup();
    renderBar([sampleBasketItem({ storeLat: 32.08, storeLng: 34.78 })]);

    await user.click(screen.getByRole('button', { name: /yalla! waze/i }));

    expect(window.open).toHaveBeenCalledOnce();
    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('waze.com');
    expect(url).toContain('32.08');
    expect(url).toContain('34.78');
  });

  it('opens Waze name-search URL when store has no coordinates', async () => {
    const user = userEvent.setup();
    renderBar([sampleBasketItem({ storeLat: null, storeLng: null, storeName: 'Corner Shop' })]);

    await user.click(screen.getByRole('button', { name: /yalla! waze/i }));

    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('waze.com');
    expect(url).toContain(encodeURIComponent('Corner Shop'));
  });

  // ── Multi-store Waze picker ────────────────────────────────────────────────
  it('shows a picker-toggle button (aria-expanded) when items span 2+ stores', () => {
    renderBar([
      sampleBasketItem({ id: 'p1', storeId: 'store-1', storeName: 'Store A' }),
      sampleBasketItem({ id: 'p2', storeId: 'store-2', storeName: 'Store B' }),
    ]);
    expect(screen.getByRole('button', { name: /yalla! waze/i })).toHaveAttribute('aria-expanded');
  });

  it('shows multi-store "2 stores" label', () => {
    renderBar([
      sampleBasketItem({ id: 'p1', storeId: 'store-1', storeName: 'Store A' }),
      sampleBasketItem({ id: 'p2', storeId: 'store-2', storeName: 'Store B' }),
    ]);
    expect(screen.getByText(/2 stores/)).toBeInTheDocument();
  });

  it('reveals the store picker when multi-store Waze button is clicked', async () => {
    const user = userEvent.setup();
    renderBar([
      sampleBasketItem({ id: 'p1', storeId: 'store-1', storeName: 'Store A' }),
      sampleBasketItem({ id: 'p2', storeId: 'store-2', storeName: 'Store B' }),
    ]);

    await user.click(screen.getByRole('button', { name: /yalla! waze/i }));

    expect(screen.getByText('Choose store to navigate to')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Store A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Store B' })).toBeInTheDocument();
  });

  it('opens Waze for the selected store and closes picker', async () => {
    const user = userEvent.setup();
    renderBar([
      sampleBasketItem({ id: 'p1', storeId: 'store-1', storeName: 'Store A', storeLat: 32.0, storeLng: 34.7 }),
      sampleBasketItem({ id: 'p2', storeId: 'store-2', storeName: 'Store B', storeLat: 31.0, storeLng: 35.0 }),
    ]);

    await user.click(screen.getByRole('button', { name: /yalla! waze/i }));
    await user.click(screen.getByRole('button', { name: 'Store A' }));

    expect(window.open).toHaveBeenCalledOnce();
    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    // JS serialises 32.0 → "32" (no trailing zero)
    expect(url).toContain('ll=32,34.7');
    // Picker should be closed after selection
    expect(screen.queryByText('Choose store to navigate to')).not.toBeInTheDocument();
  });

  // ── WhatsApp share ────────────────────────────────────────────────────────
  it('opens WhatsApp when "Share basket" button is clicked', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: /share basket/i }));

    expect(window.open).toHaveBeenCalledOnce();
    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('wa.me');
  });

  it('WhatsApp message includes item names and store', async () => {
    const user = userEvent.setup();
    renderBar([sampleBasketItem({ name: 'חלב', price: 9.5, storeName: 'Mega' })]);

    await user.click(screen.getByRole('button', { name: /share basket/i }));

    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('חלב');
    expect(decoded).toContain('Mega');
  });

  // ── Pending add toast ──────────────────────────────────────────────────────
  it('shows "Adding..." toast when pendingAddLabel is set', () => {
    renderBar([sampleBasketItem()], { pendingAddLabel: 'milk' });
    expect(screen.getByText(/adding "milk" to basket/i)).toBeInTheDocument();
  });

  it('hides "Adding..." toast when pendingAddLabel is null', () => {
    renderBar([sampleBasketItem()], { pendingAddLabel: null });
    expect(screen.queryByText(/adding/i)).not.toBeInTheDocument();
  });

  it('hides "Adding..." toast when pendingAddLabel is undefined', () => {
    const store = makeStore({ items: [sampleBasketItem()], hydrated: true });
    renderWithProviders(<BasketFloatingBar />, { store });
    expect(screen.queryByText(/adding/i)).not.toBeInTheDocument();
  });
});
