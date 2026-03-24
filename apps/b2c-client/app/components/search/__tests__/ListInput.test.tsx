import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ListInput } from '../ListInput';

function renderListInput(
  items: string[] = [],
  onItemsChange = vi.fn(),
  onBack = vi.fn(),
) {
  renderWithProviders(
    <ListInput items={items} onItemsChange={onItemsChange} onBack={onBack} />,
  );
  return { onItemsChange, onBack };
}

describe('ListInput', () => {
  // ── Initial render ────────────────────────────────────────────────────────
  it('renders the list mode header', () => {
    renderListInput();
    expect(screen.getByText('List mode')).toBeInTheDocument();
  });

  it('renders the back button', () => {
    renderListInput();
    expect(screen.getByRole('button', { name: /back to text search/i })).toBeInTheDocument();
  });

  it('renders no chips when items is empty', () => {
    renderListInput([]);
    expect(screen.queryByRole('button', { name: /remove.*from list/i })).not.toBeInTheDocument();
  });

  it('renders a chip for each item', () => {
    renderListInput(['milk', 'eggs', 'bread']);
    expect(screen.getByText('milk')).toBeInTheDocument();
    expect(screen.getByText('eggs')).toBeInTheDocument();
    expect(screen.getByText('bread')).toBeInTheDocument();
  });

  it('renders the add input placeholder', () => {
    renderListInput();
    expect(screen.getByPlaceholderText('Add item...')).toBeInTheDocument();
  });

  it('renders the keyboard help text', () => {
    renderListInput();
    expect(screen.getByText(/enter to add/i)).toBeInTheDocument();
  });

  // ── Adding items ──────────────────────────────────────────────────────────
  it('calls onItemsChange with new item when Enter is pressed', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput(['milk']);

    await user.click(screen.getByPlaceholderText('Add item...'));
    await user.keyboard('eggs{Enter}');

    expect(onItemsChange).toHaveBeenCalledWith(['milk', 'eggs']);
  });

  it('calls onItemsChange with new item when + button is clicked', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput(['milk']);

    await user.type(screen.getByPlaceholderText('Add item...'), 'eggs');
    await user.click(screen.getByRole('button', { name: /add item to list/i }));

    expect(onItemsChange).toHaveBeenCalledWith(['milk', 'eggs']);
  });

  it('does NOT add empty/whitespace-only values', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput(['milk']);

    await user.click(screen.getByPlaceholderText('Add item...'));
    await user.keyboard('   {Enter}');

    expect(onItemsChange).not.toHaveBeenCalled();
  });

  it('splits comma-separated input into multiple chips at once', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput([]);

    await user.type(screen.getByPlaceholderText('Add item...'), 'milk,eggs,bread');
    await user.click(screen.getByRole('button', { name: /add item to list/i }));

    expect(onItemsChange).toHaveBeenCalledWith(['milk', 'eggs', 'bread']);
  });

  it('trims whitespace from new items', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput([]);

    await user.type(screen.getByPlaceholderText('Add item...'), '  milk  ');
    await user.keyboard('{Enter}');

    expect(onItemsChange).toHaveBeenCalledWith(['milk']);
  });

  it('clears the input field after a successful add', async () => {
    const user = userEvent.setup();
    renderListInput(['milk']);

    const input = screen.getByPlaceholderText('Add item...');
    await user.type(input, 'eggs');
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('');
  });

  it('+ button is disabled when input is empty', () => {
    renderListInput(['milk']);
    expect(screen.getByRole('button', { name: /add item to list/i })).toBeDisabled();
  });

  it('+ button is disabled when input has only whitespace', async () => {
    const user = userEvent.setup();
    renderListInput(['milk']);
    await user.type(screen.getByPlaceholderText('Add item...'), '   ');
    expect(screen.getByRole('button', { name: /add item to list/i })).toBeDisabled();
  });

  // ── Removing items ────────────────────────────────────────────────────────
  it('calls onItemsChange without removed item when × is clicked', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput(['milk', 'eggs']);

    await user.click(screen.getByRole('button', { name: /remove milk from list/i }));

    expect(onItemsChange).toHaveBeenCalledWith(['eggs']);
  });

  it('calls onBack when the very last chip is removed', async () => {
    const user = userEvent.setup();
    const { onBack } = renderListInput(['milk']);

    await user.click(screen.getByRole('button', { name: /remove milk from list/i }));

    expect(onBack).toHaveBeenCalled();
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  it('calls onBack when Escape is pressed with empty input', async () => {
    const user = userEvent.setup();
    const { onBack } = renderListInput(['milk']);

    await user.click(screen.getByPlaceholderText('Add item...'));
    await user.keyboard('{Escape}');

    expect(onBack).toHaveBeenCalled();
  });

  it('clears text (not back) when Escape is pressed with text in input', async () => {
    const user = userEvent.setup();
    const { onBack } = renderListInput(['milk']);

    const input = screen.getByPlaceholderText('Add item...');
    await user.type(input, 'eggs');
    await user.keyboard('{Escape}');

    expect(input).toHaveValue('');
    expect(onBack).not.toHaveBeenCalled();
  });

  it('removes the last chip when Backspace is pressed on empty input', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput(['milk', 'eggs']);

    await user.click(screen.getByPlaceholderText('Add item...'));
    await user.keyboard('{Backspace}');

    expect(onItemsChange).toHaveBeenCalledWith(['milk']);
  });

  it('calls onBack when Backspace removes the very last item', async () => {
    const user = userEvent.setup();
    const { onBack } = renderListInput(['milk']);

    await user.click(screen.getByPlaceholderText('Add item...'));
    await user.keyboard('{Backspace}');

    expect(onBack).toHaveBeenCalled();
  });

  it('does NOT remove a chip when Backspace is pressed but input has text', async () => {
    const user = userEvent.setup();
    const { onItemsChange } = renderListInput(['milk']);

    await user.type(screen.getByPlaceholderText('Add item...'), 'eg');
    await user.keyboard('{Backspace}');

    // Backspace only deleted the 'g' — no chip removed
    expect(onItemsChange).not.toHaveBeenCalled();
  });

  // ── Back button ───────────────────────────────────────────────────────────
  it('calls onBack when the Back button is clicked', async () => {
    const user = userEvent.setup();
    const { onBack } = renderListInput(['milk']);

    await user.click(screen.getByRole('button', { name: /back to text search/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
