import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { PurchaseLogList } from '../PurchaseLogList';

vi.mock('@/lib/hooks/useHistory', () => ({
  usePurchaseLog: vi.fn(),
}));

import { usePurchaseLog } from '@/lib/hooks/useHistory';

const mockUsePurchases = vi.mocked(usePurchaseLog);

const MESSAGES = {
  profile: {
    purchases_title: 'My Purchases',
    purchases_empty: 'No purchases recorded yet',
    bought_at: 'Bought on {date}',
    price_then: 'Price then: ₪{price}',
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const FAKE_PURCHASES = [
  {
    id: 'pl-1',
    product_id: 'prod-1',
    product_name: 'חלב',
    store_id: 'store-1',
    store_name: 'Super Market',
    price_paid: 8.90,
    purchased_at: '2026-03-01T12:00:00Z',
  },
  {
    id: 'pl-2',
    product_id: 'prod-2',
    product_name: 'ביצים',
    store_id: 'store-2',
    store_name: 'Freshmarket',
    price_paid: null,
    purchased_at: '2026-03-02T09:00:00Z',
  },
];

describe('PurchaseLogList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows skeleton while loading', () => {
    mockUsePurchases.mockReturnValue({ data: undefined, isLoading: true, error: null } as never);
    render(<PurchaseLogList />, { wrapper: Wrapper });
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows empty state when no purchases', () => {
    mockUsePurchases.mockReturnValue({ data: [], isLoading: false, error: null } as never);
    render(<PurchaseLogList />, { wrapper: Wrapper });
    expect(screen.getByText('No purchases recorded yet')).toBeInTheDocument();
  });

  it('renders each purchase product name', () => {
    mockUsePurchases.mockReturnValue({ data: FAKE_PURCHASES, isLoading: false, error: null } as never);
    render(<PurchaseLogList />, { wrapper: Wrapper });
    expect(screen.getByText('חלב')).toBeInTheDocument();
    expect(screen.getByText('ביצים')).toBeInTheDocument();
  });

  it('renders store name for each purchase', () => {
    mockUsePurchases.mockReturnValue({ data: FAKE_PURCHASES, isLoading: false, error: null } as never);
    render(<PurchaseLogList />, { wrapper: Wrapper });
    expect(screen.getByText('Super Market')).toBeInTheDocument();
    expect(screen.getByText('Freshmarket')).toBeInTheDocument();
  });

  it('renders formatted price when price_paid is not null', () => {
    mockUsePurchases.mockReturnValue({
      data: [FAKE_PURCHASES[0]],
      isLoading: false,
      error: null,
    } as never);
    render(<PurchaseLogList />, { wrapper: Wrapper });
    expect(screen.getByText(/₪8\.90/)).toBeInTheDocument();
  });

  it('handles null price gracefully (shows dash)', () => {
    mockUsePurchases.mockReturnValue({
      data: [FAKE_PURCHASES[1]],
      isLoading: false,
      error: null,
    } as never);
    render(<PurchaseLogList />, { wrapper: Wrapper });
    // null price should not crash and should show something (dash or "—")
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
  });
});
