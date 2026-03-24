import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PriceChart } from '../PriceChart';

const MESSAGES = { profile: { no_analytics: 'No price data yet' } };

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

const TIMELINE = [
  { date: '2026-01-01', price: 10 },
  { date: '2026-02-01', price: 12 },
  { date: '2026-03-01', price: 9 },
];

const STATS = { min: 9, max: 12, first: 10, latest: 9, change: -10 };

describe('PriceChart', () => {
  it('renders no-data state when timeline is empty', () => {
    render(<PriceChart productName="milk" timeline={[]} stats={null} />, { wrapper: Wrapper });
    expect(screen.getByText('No price data yet')).toBeInTheDocument();
  });

  it('renders the product name as a heading', () => {
    render(<PriceChart productName="חלב" timeline={TIMELINE} stats={STATS} />, { wrapper: Wrapper });
    expect(screen.getByRole('heading', { name: /חלב/i })).toBeInTheDocument();
  });

  it('renders min and max prices', () => {
    render(<PriceChart productName="milk" timeline={TIMELINE} stats={STATS} />, { wrapper: Wrapper });
    // min=9, latest=9 so ₪9.00 appears twice (Min and Latest columns) — use getAllByText
    expect(screen.getAllByText(/₪9\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/₪12\.00/)).toBeInTheDocument(); // max (unique)
  });

  it('renders an SVG chart element', () => {
    const { container } = render(
      <PriceChart productName="milk" timeline={TIMELINE} stats={STATS} />,
      { wrapper: Wrapper },
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders a price point for each timeline entry', () => {
    const { container } = render(
      <PriceChart productName="milk" timeline={TIMELINE} stats={STATS} />,
      { wrapper: Wrapper },
    );
    // Each data point is a <circle> in the SVG
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(TIMELINE.length);
  });

  it('shows price drop indicator when change is negative', () => {
    render(<PriceChart productName="milk" timeline={TIMELINE} stats={STATS} />, { wrapper: Wrapper });
    expect(screen.getByText(/-10\.0%/)).toBeInTheDocument();
  });

  it('shows price rise indicator when change is positive', () => {
    const risingStats = { ...STATS, change: 20 };
    render(
      <PriceChart productName="milk" timeline={TIMELINE} stats={risingStats} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/\+20\.0%/)).toBeInTheDocument();
  });

  it('handles single data point (no trend to draw)', () => {
    render(
      <PriceChart
        productName="milk"
        timeline={[{ date: '2026-01-01', price: 10 }]}
        stats={null}
      />,
      { wrapper: Wrapper },
    );
    // Single point: still renders without crash, no error state
    expect(screen.queryByText('No price data yet')).not.toBeInTheDocument();
  });
});
