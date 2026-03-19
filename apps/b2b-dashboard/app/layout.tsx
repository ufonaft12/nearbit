import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nearbit — Merchant Dashboard",
  description: "B2B merchant dashboard for Nearbit grocery price aggregator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
