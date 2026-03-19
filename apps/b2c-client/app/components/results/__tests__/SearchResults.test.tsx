import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, makeStore, sampleResult } from '@/test-utils';
import { SearchResults } from '../SearchResults';
import { SearchError } from '@/lib/search';

const BASE_PROPS = {
  data:            undefined,
  isFetching:      false,
  isError:         false,
  error:           null,
  isSuccess:       false,
  committedQuery:  '',
  showInitialHint: false,
  suggestions:     ['milk', 'eggs', 'bread'] as readonly string[],
};

describe('SearchResults', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  // ── Initial hint ───────────────────────────────────────────────────────────
  it('shows initial hint when showInitialHint=true', () => {
    renderWithProviders(
      <SearchResults {...BASE_PROPS} showInitialHint={true} />,
    );
    expect(screen.getByText(/type at least 2 characters/i)).toBeInTheDocument();
  });

  it('hides initial hint when showInitialHint=false', () => {
    renderWithProviders(
      <SearchResults {...BASE_PROPS} showInitialHint={false} />,
    );
    expect(screen.queryByText(/type at least/i)).not.toBeInTheDocument();
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  it('renders skeleton loaders when isFetching=true (via aria-label)', () => {
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isFetching={true} />,
    );
    // The skeleton container has aria-label="Loading results" and aria-busy="true"
    expect(screen.getByLabelText('Loading results')).toBeInTheDocument();
  });

  it('does not render results content while fetching', () => {
    const data = {
      answer:  'Fresh milk available',
      results: [sampleResult()],
    };
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isFetching={true} data={data} isSuccess={true} />,
    );
    // Should show skeleton, not actual answer card
    expect(screen.queryByText('Assistant')).not.toBeInTheDocument();
    expect(screen.queryByText('Fresh milk available')).not.toBeInTheDocument();
  });

  // ── Network error ──────────────────────────────────────────────────────────
  it('shows network error alert when SearchError.isNetworkError=true', () => {
    // SearchError(message, status?, isNetworkError=false)
    const networkError = new SearchError('Network failed', undefined, true);
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isError={true} error={networkError} />,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Connection error')).toBeInTheDocument();
    expect(within(alert).getByText(/could not reach the server/i)).toBeInTheDocument();
  });

  it('does NOT show network-error box for regular API errors', () => {
    const apiError = new Error('Rate limit exceeded');
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isError={true} error={apiError} />,
    );
    expect(screen.queryByText('Connection error')).not.toBeInTheDocument();
  });

  // ── API error ──────────────────────────────────────────────────────────────
  it('shows the error message text for non-network errors', () => {
    const apiError = new Error('API rate limit exceeded');
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isError={true} error={apiError} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('API rate limit exceeded')).toBeInTheDocument();
  });

  it('shows fallback "Search failed" text when error prop is null (edge case)', () => {
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isError={true} error={null} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Search failed. Please try again.')).toBeInTheDocument();
  });

  // ── Successful results ─────────────────────────────────────────────────────
  it('renders AnswerCard with the LLM answer when isSuccess=true', () => {
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="milk"
        data={{ answer: 'Milk is cheap today.', results: [sampleResult()] }}
      />,
    );
    expect(screen.getByText('Milk is cheap today.')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });

  it('renders a ProductCard for each result', () => {
    const results = [
      sampleResult({ id: 'p1', nameHe: 'חלב',  storeName: 'Store A' }),
      sampleResult({ id: 'p2', nameHe: 'ביצים', storeName: 'Store B' }),
    ];
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="milk"
        data={{ answer: 'Found items', results }}
      />,
    );
    expect(screen.getByText('חלב')).toBeInTheDocument();
    expect(screen.getByText('ביצים')).toBeInTheDocument();
  });

  it('shows singular "1 result for..." copy', () => {
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="milk"
        data={{ answer: 'Found', results: [sampleResult()] }}
      />,
    );
    expect(screen.getByText(/1 result for "milk"/)).toBeInTheDocument();
  });

  it('shows plural "N results for..." copy', () => {
    const results = [sampleResult({ id: 'p1' }), sampleResult({ id: 'p2' })];
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="eggs"
        data={{ answer: 'Found', results }}
      />,
    );
    expect(screen.getByText(/2 results for "eggs"/)).toBeInTheDocument();
  });

  // ── Empty results ──────────────────────────────────────────────────────────
  it('shows "No products found" when results array is empty', () => {
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="xyzzy"
        data={{ answer: 'Nothing found.', results: [] }}
      />,
    );
    expect(screen.getByText('No products found')).toBeInTheDocument();
  });

  it('shows the npm run seed tip (as rendered code element) in no-results state', () => {
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="xyzzy"
        data={{ answer: 'Nothing.', results: [] }}
      />,
    );
    expect(screen.getByText('npm run seed')).toBeInTheDocument();
  });

  // ── Basket integration (ProductCard inBasket prop) ─────────────────────────
  it('marks a ProductCard as in-basket when its ID is in the Redux store', () => {
    const result = sampleResult({ id: 'prod-1' });
    const store = makeStore({
      items: [{
        id: 'prod-1', name: 'חלב', price: 8.9,
        storeName: 'Store', storeId: 'store-1', query: 'milk',
      }],
      hydrated: true,
    });
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="milk"
        data={{ answer: 'Found', results: [result] }}
      />,
      { store },
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('marks ProductCard as NOT in-basket when its ID is absent from store', () => {
    const result = sampleResult({ id: 'prod-999' });
    const store = makeStore({
      items: [{
        id: 'prod-1', name: 'חלב', price: 8.9,
        storeName: 'Store', storeId: 'store-1', query: 'milk',
      }],
      hydrated: true,
    });
    renderWithProviders(
      <SearchResults
        {...BASE_PROPS}
        isSuccess={true}
        committedQuery="milk"
        data={{ answer: 'Found', results: [result] }}
      />,
      { store },
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  });

  // ── Edge: undefined data with isSuccess=true ───────────────────────────────
  it('renders nothing visible when data is undefined even if isSuccess=true', () => {
    // Can't happen in practice but guard should be there
    renderWithProviders(
      <SearchResults {...BASE_PROPS} isSuccess={true} data={undefined} />,
    );
    // Results section should not render
    expect(screen.queryByText('Assistant')).not.toBeInTheDocument();
  });
});
