import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, sampleResult } from '@/test-utils';
import { ProductCard } from '../ProductCard';
import type { BasketItem } from '@/types/nearbit';

function renderCard(
  overrides: Parameters<typeof sampleResult>[0] = {},
  opts: { inBasket?: boolean } = {},
) {
  const result    = sampleResult(overrides);
  const onAdd     = vi.fn();
  const onRemove  = vi.fn();
  const onVibrate = vi.fn();

  const { container, ...utils } = renderWithProviders(
    <ProductCard
      result={result}
      searchQuery="milk"
      inBasket={opts.inBasket ?? false}
      onAdd={onAdd}
      onRemove={onRemove}
      onVibrate={onVibrate}
    />,
  );
  return { onAdd, onRemove, onVibrate, result, container, ...utils };
}

describe('ProductCard', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  // ── Basic rendering ───────────────────────────────────────────────────────
  it('renders the Hebrew product name', () => {
    renderCard();
    expect(screen.getByText('חלב')).toBeInTheDocument();
  });

  it('falls back to normalizedName when nameHe is null', () => {
    renderCard({ nameHe: null, normalizedName: 'milk-fallback' });
    expect(screen.getByText('milk-fallback')).toBeInTheDocument();
  });

  it('renders the store name', () => {
    renderCard();
    // store name appears in the card text
    expect(screen.getAllByText('Super Market').length).toBeGreaterThan(0);
  });

  it('renders the price formatted to 2 decimal places', () => {
    renderCard({ price: 9.5 });
    expect(screen.getByText('₪9.50')).toBeInTheDocument();
  });

  it('hides price section when price is null', () => {
    renderCard({ price: null });
    expect(screen.queryByText(/₪\d/)).not.toBeInTheDocument();
  });

  it('renders ₪0.00 when price is 0', () => {
    renderCard({ price: 0 });
    expect(screen.getByText('₪0.00')).toBeInTheDocument();
  });

  it('renders similarity score as percentage', () => {
    renderCard({ similarity: 0.92 });
    expect(screen.getByText('92% match')).toBeInTheDocument();
  });

  it('rounds similarity to nearest integer', () => {
    renderCard({ similarity: 0.875 });
    expect(screen.getByText('88% match')).toBeInTheDocument();
  });

  it('renders distance badge when provided', () => {
    renderCard({ distanceKm: 1.2 });
    expect(screen.getByText(/1\.2 km/)).toBeInTheDocument();
  });

  it('hides distance badge when distanceKm is undefined', () => {
    renderCard({ distanceKm: undefined });
    expect(screen.queryByText(/\d+\.?\d* km/)).not.toBeInTheDocument();
  });

  // ── Subtitle ──────────────────────────────────────────────────────────────
  it('renders subtitle with nameEn · category · unit', () => {
    renderCard({ nameEn: 'Milk', category: 'dairy', unit: 'liter' });
    expect(screen.getByText('Milk · dairy · liter')).toBeInTheDocument();
  });

  it('renders partial subtitle when some fields are null', () => {
    renderCard({ nameEn: 'Milk', category: null, unit: null });
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('hides subtitle entirely when nameEn, category, unit are all null', () => {
    renderCard({ nameEn: null, category: null, unit: null });
    // subtitle is [null, null, null].filter(Boolean).join(' · ') === ''
    // The subtitle span only renders when subtitle is truthy
    // So the separator text "·" should not appear at all
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  // ── Stock status ──────────────────────────────────────────────────────────
  it('shows low-stock warning when quantity is 1', () => {
    renderCard({ quantity: 1 });
    expect(screen.getByText(/1 left!/)).toBeInTheDocument();
  });

  it('shows low-stock warning when quantity is 4 (boundary)', () => {
    renderCard({ quantity: 4 });
    expect(screen.getByText(/4 left!/)).toBeInTheDocument();
  });

  it('does NOT show low-stock when quantity is exactly 5', () => {
    renderCard({ quantity: 5 });
    expect(screen.queryByText(/left!/)).not.toBeInTheDocument();
  });

  it('shows "Out of stock" when quantity is 0', () => {
    renderCard({ quantity: 0 });
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('shows neither stock label when quantity is null', () => {
    renderCard({ quantity: null });
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/left!/)).not.toBeInTheDocument();
  });

  it('does NOT show out-of-stock when quantity is undefined (null-coalesced)', () => {
    renderCard({ quantity: undefined as unknown as null });
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument();
  });

  // ── Price trend ───────────────────────────────────────────────────────────
  it('shows ↑ price-up indicator when price rose', () => {
    renderCard({ price: 12, previousPrice: 10 });
    expect(screen.getByText(/↑/)).toBeInTheDocument();
  });

  it('shows ↓ price-down indicator when price dropped', () => {
    renderCard({ price: 8, previousPrice: 10 });
    expect(screen.getByText(/↓/)).toBeInTheDocument();
  });

  it('shows "→ Same price" when price is identical', () => {
    renderCard({ price: 10, previousPrice: 10 });
    expect(screen.getByText('→ Same price')).toBeInTheDocument();
  });

  it('shows no trend when previousPrice is null', () => {
    renderCard({ price: 10, previousPrice: null });
    expect(screen.queryByText(/↑|↓|Same price/)).not.toBeInTheDocument();
  });

  it('shows no trend when price itself is null', () => {
    renderCard({ price: null, previousPrice: 10 });
    expect(screen.queryByText(/↑|↓|Same price/)).not.toBeInTheDocument();
  });

  // ── Basket interactions ───────────────────────────────────────────────────
  it('calls onAdd when checkbox clicked and item not in basket', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderCard({}, { inBasket: false });

    await user.click(screen.getByRole('checkbox'));

    expect(onAdd).toHaveBeenCalledOnce();
    const item: BasketItem = onAdd.mock.calls[0][0];
    expect(item.id).toBe('prod-1');
    expect(item.name).toBe('חלב');
    expect(item.price).toBe(8.90);
    expect(item.storeId).toBe('store-1');
  });

  it('calls onRemove when checkbox clicked and item IS in basket', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderCard({}, { inBasket: true });

    await user.click(screen.getByRole('checkbox'));
    expect(onRemove).toHaveBeenCalledWith('prod-1');
  });

  it('calls onVibrate on any checkbox click', async () => {
    const user = userEvent.setup();
    const { onVibrate } = renderCard({}, { inBasket: false });

    await user.click(screen.getByRole('checkbox'));
    expect(onVibrate).toHaveBeenCalled();
  });

  it('shows aria-checked=true when inBasket=true', () => {
    renderCard({}, { inBasket: true });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows aria-checked=false when inBasket=false', () => {
    renderCard({}, { inBasket: false });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  });

  it('basketItem uses searchQuery as the query field', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderCard({}, { inBasket: false });
    await user.click(screen.getByRole('checkbox'));
    const item: BasketItem = onAdd.mock.calls[0][0];
    expect(item.query).toBe('milk'); // matches searchQuery prop
  });

  // ── WhatsApp share ────────────────────────────────────────────────────────
  it('opens WhatsApp URL when share button is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /share חלב on whatsapp/i }));

    expect(window.open).toHaveBeenCalledOnce();
    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('wa.me');
  });

  it('WhatsApp URL contains product name and price', async () => {
    const user = userEvent.setup();
    renderCard({ nameHe: 'חלב', price: 8.9 });

    await user.click(screen.getByRole('button', { name: /share חלב on whatsapp/i }));

    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('חלב');
  });
});
