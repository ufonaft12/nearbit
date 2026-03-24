import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export type Locale = "en" | "he" | "ru";

export const LOCALES: Locale[] = ["en", "he", "ru"];
export const DEFAULT_LOCALE: Locale = "he";

/** Languages that use right-to-left text direction. */
export const RTL_LOCALES: Locale[] = ["he"];

export function getDir(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export function isValidLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value ?? DEFAULT_LOCALE;
  const locale = isValidLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
