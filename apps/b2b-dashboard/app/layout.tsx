import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getDir } from "@/i18n/request";
import type { Locale } from "@/i18n/request";
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
  const messages = await getMessages();
  const dir = getDir(locale);

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocaleProvider initialLocale={locale}>
            {children}
          </LocaleProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
