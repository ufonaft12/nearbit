import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import { HtmlDirSync } from "./components/HtmlDirSync";
import "./globals.css";

const geistSans = localFont({
  src: [
    { path: "../public/fonts/geist-latin.woff2",     weight: "100 900", style: "normal" },
    { path: "../public/fonts/geist-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    { path: "../public/fonts/geist-mono-latin.woff2",     weight: "100 900", style: "normal" },
    { path: "../public/fonts/geist-mono-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nearbit – Local Store Search",
  description: "Search products across local Israeli grocery stores in Hebrew, Russian, or English.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nearbit",
  },
  icons: {
    apple: "/icons/icon.svg",
  },
};

// theme-color follows the user's current color scheme preference
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)",  color: "#18181b" },
  ],
  width: "device-width",
  initialScale: 1,
  // viewportFit=cover enables env(safe-area-inset-bottom) so the floating
  // basket bar clears the iPhone home indicator and Android gesture nav bar.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes modifies class after hydration.
    // lang/dir are updated client-side by HtmlDirSync based on chosen locale.
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <HtmlDirSync />
          {children}
        </Providers>
      </body>
    </html>
  );
}
