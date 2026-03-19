import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { SearchHistoryList } from '../SearchHistoryList';

vi.mock('@/lib/hooks/useHistory', () => ({
  useSearchHistory: vi.fn(),
}));

import { useSearchHistory } from '@/lib/hooks/useHistory';

const mockUseHistory = vi.mocked(useSearchHistory);

const MESSAGES = {
  profile: {
    history_title: 'Search History',
    history_empty: 'No searches yet',
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

function renderList() {
  return render(<SearchHistoryList />, { wrapper: Wrapper });
}

describe('SearchHistoryList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows skeleton while loading', () => {
    mockUseHistory.mockReturnValue({ data: undefined, isLoading: true, error: null } as never);
    renderList();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows empty state when no history', () => {
    mockUseHistory.mockReturnValue({ data: [], isLoading: false, error: null } as never);
    renderList();
    expect(screen.getByText('No searches yet')).toBeInTheDocument();
  });

  it('renders each search query', () => {
    mockUseHistory.mockReturnValue({
      data: [
        { id: '1', query: 'milk', results_count: 5, searched_at: '2026-03-01T10:00:00Z' },
        { id: '2', query: 'eggs', results_count: 3, searched_at: '2026-03-02T11:00:00Z' },
      ],
      isLoading: false,
      error: null,
    } as never);
    renderList();
    expect(screen.getByText('milk')).toBeInTheDocument();
    expect(screen.getByText('eggs')).toBeInTheDocument();
  });

  it('shows result count for each item', () => {
    mockUseHistory.mockReturnValue({
      data: [{ id: '1', query: 'milk', results_count: 7, searched_at: '2026-03-01T10:00:00Z' }],
      isLoading: false,
      error: null,
    } as never);
    renderList();
    expect(screen.getByText(/7 result/i)).toBeInTheDocument();
  });

  it('clicking a query item fires onSearch callback', async () => {
    const onSearch = vi.fn();
    mockUseHistory.mockReturnValue({
      data: [{ id: '1', query: 'hummus', results_count: 2, searched_at: '2026-03-01T10:00:00Z' }],
      isLoading: false,
      error: null,
    } as never);
    render(
      <Wrapper>
        <SearchHistoryList onSearch={onSearch} />
      </Wrapper>,
    );
    await userEvent.click(screen.getByText('hummus'));
    expect(onSearch).toHaveBeenCalledWith('hummus');
  });
});
