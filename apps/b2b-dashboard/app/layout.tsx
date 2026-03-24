import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { getDir } from "@/i18n/locale";
import type { Locale } from "@/i18n/locale";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nearbit — Merchant Dashboard",
  description: "B2B merchant dashboard for Nearbit grocery price aggregator",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = (await getLocale()) as Locale;
  const dir = getDir(locale);

  // Load all locales once — passed to LocaleProvider so switching is instant (no server round-trip)
  const [en, he, ru] = await Promise.all([
    import("../messages/en.json").then((m) => m.default),
    import("../messages/he.json").then((m) => m.default),
    import("../messages/ru.json").then((m) => m.default),
  ]);

  return (
    <html lang={locale} dir={dir}>
      <body>
        <LocaleProvider initialLocale={locale} allMessages={{ en, he, ru }}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
