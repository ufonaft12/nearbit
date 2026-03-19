import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { AnswerCard } from '../AnswerCard';

describe('AnswerCard', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('renders the answer text', () => {
    renderWithProviders(<AnswerCard answer="Fresh milk is available." query="milk" />);
    expect(screen.getByText('Fresh milk is available.')).toBeInTheDocument();
  });

  it('renders the "Assistant" label', () => {
    renderWithProviders(<AnswerCard answer="Test answer" query="test" />);
    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });

  it('renders the share button', () => {
    renderWithProviders(<AnswerCard answer="test" query="test" />);
    expect(screen.getByRole('button', { name: /share answer on whatsapp/i })).toBeInTheDocument();
  });

  it('opens WhatsApp URL on share click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnswerCard answer="Great deal on milk" query="milk" />);

    await user.click(screen.getByRole('button', { name: /share answer on whatsapp/i }));

    expect(window.open).toHaveBeenCalledOnce();
    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('wa.me');
    expect(url).toContain(encodeURIComponent('milk'));
  });

  it('handles an empty answer without crashing', () => {
    renderWithProviders(<AnswerCard answer="" query="test" />);
    expect(screen.getByRole('button', { name: /share answer on whatsapp/i })).toBeInTheDocument();
  });

  it('handles an empty query without crashing', () => {
    renderWithProviders(<AnswerCard answer="Some answer" query="" />);
    expect(screen.getByText('Some answer')).toBeInTheDocument();
  });

  it('renders answer with dir="auto" for RTL/LTR auto-detection', () => {
    const { container } = renderWithProviders(<AnswerCard answer="חלב טרי" query="חלב" />);
    const answerPara = container.querySelector('[dir="auto"]');
    expect(answerPara).toBeInTheDocument();
    expect(answerPara?.textContent).toBe('חלב טרי');
  });

  it('encodes special characters in the WhatsApp URL', async () => {
    const user = userEvent.setup();
    const answer = 'Price: ₪9.99 & available!';
    renderWithProviders(<AnswerCard answer={answer} query="milk & eggs" />);

    await user.click(screen.getByRole('button', { name: /share answer on whatsapp/i }));

    const [url] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    // Raw spaces should not appear in the wa.me URL query string
    expect(url).not.toMatch(/wa\.me\/\?text=[^%]*\s/);
  });

  it('passes noopener to window.open', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnswerCard answer="test" query="test" />);
    await user.click(screen.getByRole('button', { name: /share answer on whatsapp/i }));
    const [, , features] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(features).toContain('noopener');
  });
});
