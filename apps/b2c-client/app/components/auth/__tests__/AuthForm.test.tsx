import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { AuthForm } from '../AuthForm';

// ── Mock server actions ────────────────────────────────────────────────────────
vi.mock('@/app/login/actions', () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
}));

import { signInAction, signUpAction, signInWithGoogleAction } from '@/app/login/actions';

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGoogle = vi.mocked(signInWithGoogleAction);

// ── Auth i18n messages ────────────────────────────────────────────────────────
const AUTH_MESSAGES = {
  auth: {
    signin_title: 'Sign in',
    signup_title: 'Create account',
    email_placeholder: 'Email address',
    password_placeholder: 'Password',
    signin_submit: 'Sign in',
    signup_submit: 'Create account',
    google_button: 'Continue with Google',
    switch_to_signup: "Don't have an account? Sign up",
    switch_to_signin: 'Already have an account? Sign in',
    loading: 'Loading…',
    check_email: 'Check your email for a confirmation link.',
    signout: 'Sign out',
    error_invalid: 'Invalid email or password.',
  },
};

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={AUTH_MESSAGES}>
      <AuthForm />
    </NextIntlClientProvider>,
  );
}

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────
  it('renders email and password fields', () => {
    renderForm();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders "Sign in" title by default', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders submit button labelled "Sign in" by default', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('renders Google OAuth button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('renders mode-switch button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /don't have an account/i })).toBeInTheDocument();
  });

  // ── Mode toggle ────────────────────────────────────────────────────────────
  it('switches to sign-up mode when toggle is clicked', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /don't have an account/i }));
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create account$/i })).toBeInTheDocument();
  });

  it('switches back to sign-in mode from sign-up', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /don't have an account/i }));
    await userEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  // ── Sign-in flow ───────────────────────────────────────────────────────────
  it('calls signInAction with entered credentials', async () => {
    mockSignIn.mockResolvedValue(null); // null = success (redirect happens server-side)
    renderForm();

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'secret123');
    });
  });

  it('shows error message when signInAction returns an error', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid credentials' });
    renderForm();

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'bad@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });

  // ── Sign-up flow ───────────────────────────────────────────────────────────
  it('shows "check your email" message after successful sign-up', async () => {
    mockSignUp.mockResolvedValue(null); // null = success
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /don't have an account/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/check your email/i);
    });
  });

  it('shows error message when signUpAction returns an error', async () => {
    mockSignUp.mockResolvedValue({ error: 'Email already registered' });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /don't have an account/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'dupe@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'somepassword');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email already registered');
    });
  });

  // ── Google OAuth ────────────────────────────────────────────────────────────
  it('calls signInWithGoogleAction when Google button is clicked', async () => {
    mockGoogle.mockResolvedValue(undefined);
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(mockGoogle).toHaveBeenCalledTimes(1);
    });
  });

  // ── Loading state ───────────────────────────────────────────────────────────
  it('disables submit button while request is pending', async () => {
    // Never resolves → stays pending
    mockSignIn.mockImplementation(() => new Promise(() => {}));
    renderForm();

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
    });
  });

  // ── Error cleared on mode switch ───────────────────────────────────────────
  it('clears error message when switching mode', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid credentials' });
    renderForm();

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'bad@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // Switch mode → error should disappear
    await userEvent.click(screen.getByRole('button', { name: /don't have an account/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
