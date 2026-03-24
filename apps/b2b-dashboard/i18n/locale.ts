/** Shared locale utilities — no server-only imports, safe to use in Client Components. */

export type Locale = "en" | "he" | "ru";

export const LOCALES: Locale[] = ["en", "he", "ru"];
export const DEFAULT_LOCALE: Locale = "he";
export const RTL_LOCALES: Locale[] = ["he"];

export function getDir(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export function isValidLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}
