import { NextRequest, NextResponse } from "next/server";
import { isValidLocale } from "@/i18n/request";

/**
 * POST /api/set-locale?locale=he
 * Persists the user's chosen locale to a cookie so next-intl picks it up
 * on every subsequent server render.
 */
export async function POST(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get("locale");

  if (!locale || !isValidLocale(locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: false, // client JS may read it for optimistic display
  });
  return res;
}
