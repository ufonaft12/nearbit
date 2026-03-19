/**
 * TDD tests for ProfileEditForm component.
 * Written BEFORE implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ProfileEditForm } from '../ProfileEditForm';

// ── Mock useProfile hook ───────────────────────────────────────────────────────

const mockUpdateProfile = vi.fn();
const mockUseProfile = vi.fn();
const mockUseUpdateProfile = vi.fn();

vi.mock('@/lib/hooks/useProfile', () => ({
  useProfile: (...args: unknown[]) => mockUseProfile(...args),
  useUpdateProfile: (...args: unknown[]) => mockUseUpdateProfile(...args),
}));

function setProfileState(overrides: {
  data?: { address: string | null; city: string | null } | null;
  isLoading?: boolean;
}) {
  mockUseProfile.mockReturnValue({
    data: { address: '1 Main St', city: 'Tel Aviv' },
    isLoading: false,
    ...overrides,
  });
}

function setUpdateState(overrides: {
  isPending?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  error?: Error | null;
}) {
  mockUseUpdateProfile.mockReturnValue({
    mutate: mockUpdateProfile,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileEditForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path state
    setProfileState({});
    setUpdateState({});
  });

  it('renders address and city fields', () => {
    renderWithProviders(<ProfileEditForm />);
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
  });

  it('pre-fills fields with existing profile data', () => {
    renderWithProviders(<ProfileEditForm />);
    expect(screen.getByDisplayValue('1 Main St')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tel Aviv')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading=true', () => {
    setProfileState({ data: null, isLoading: true });
    renderWithProviders(<ProfileEditForm />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('calls mutate on form submit with trimmed values', async () => {
    renderWithProviders(<ProfileEditForm />);
    const addressInput = screen.getByLabelText(/address/i);
    await userEvent.clear(addressInput);
    await userEvent.type(addressInput, '  New Address  ');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'New Address' }),
      );
    });
  });

  it('shows saving state while mutation is pending', () => {
    setUpdateState({ isPending: true });
    renderWithProviders(<ProfileEditForm />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('shows success message after save', () => {
    setUpdateState({ isSuccess: true });
    renderWithProviders(<ProfileEditForm />);
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('shows error message on failure', () => {
    setUpdateState({ isError: true, error: new Error('Update failed') });
    renderWithProviders(<ProfileEditForm />);
    expect(screen.getByText(/update failed/i)).toBeInTheDocument();
  });
});
