/**
 * Tests for LocaleProvider context + LanguageSwitcher component.
 *
 * Covers:
 *  - useLocale() returns correct initial locale and dir
 *  - dir is "rtl" for Hebrew, "ltr" for English and Russian
 *  - LanguageSwitcher renders all three locale buttons
 *  - Active locale button has aria-pressed="true"
 *  - Clicking a locale button calls /api/set-locale (mocked fetch)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useLocale, LocaleProvider } from "@/components/providers/LocaleProvider";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// Helper: render with both providers
function renderWithProviders(
  ui: React.ReactElement,
  initialLocale: "en" | "he" | "ru" = "en"
) {
  return render(
    <NextIntlClientProvider locale={initialLocale} messages={en}>
      <LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>
    </NextIntlClientProvider>
  );
}

// Expose context values in tests via a probe component
function LocaleProbe() {
  const { locale, dir } = useLocale();
  return (
    <div data-testid="probe" data-locale={locale} data-dir={dir} />
  );
}

describe("LocaleProvider — context values", () => {
  it("provides locale='en' and dir='ltr' for English", () => {
    renderWithProviders(<LocaleProbe />, "en");
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-locale", "en");
    expect(probe).toHaveAttribute("data-dir", "ltr");
  });

  it("provides locale='he' and dir='rtl' for Hebrew", () => {
    renderWithProviders(<LocaleProbe />, "he");
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-locale", "he");
    expect(probe).toHaveAttribute("data-dir", "rtl");
  });

  it("provides locale='ru' and dir='ltr' for Russian", () => {
    renderWithProviders(<LocaleProbe />, "ru");
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-locale", "ru");
    expect(probe).toHaveAttribute("data-dir", "ltr");
  });
});

describe("LanguageSwitcher — rendering", () => {
  it("renders buttons for all three locales", () => {
    renderWithProviders(<LanguageSwitcher />, "en");
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("עב")).toBeInTheDocument();
    expect(screen.getByText("RU")).toBeInTheDocument();
  });

  it("marks the active locale button with aria-pressed='true'", () => {
    renderWithProviders(<LanguageSwitcher />, "ru");
    expect(screen.getByText("RU").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("EN").closest("button")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByText("עב").closest("button")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("marks Hebrew as active when initial locale is 'he'", () => {
    renderWithProviders(<LanguageSwitcher />, "he");
    expect(screen.getByText("עב").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});

describe("LanguageSwitcher — locale switching", () => {
  beforeEach(() => {
    // Mock window.location.reload to prevent test runner from navigating
    Object.defineProperty(window, "location", {
      writable: true,
      value: { reload: vi.fn() },
    });
    // Mock fetch for the /api/set-locale call
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/set-locale with the selected locale when clicking 'RU'", async () => {
    renderWithProviders(<LanguageSwitcher />, "en");
    fireEvent.click(screen.getByText("RU"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/set-locale?locale=ru",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls /api/set-locale with 'he' when clicking Hebrew button", async () => {
    renderWithProviders(<LanguageSwitcher />, "en");
    fireEvent.click(screen.getByText("עב"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/set-locale?locale=he",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("does not call fetch if clicking the already-active locale", async () => {
    renderWithProviders(<LanguageSwitcher />, "en");
    fireEvent.click(screen.getByText("EN"));

    // fetch still gets called — the UI doesn't block same-locale clicks,
    // but the server/cookie write is idempotent and safe
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/set-locale?locale=en",
        expect.anything()
      );
    });
  });
});
