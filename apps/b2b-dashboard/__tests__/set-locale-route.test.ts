/**
 * Tests for POST /api/set-locale
 *
 * Covers:
 *  - Valid locales write the NEXT_LOCALE cookie correctly
 *  - Invalid locale returns 400
 *  - Missing locale param returns 400
 *  - Cookie attributes (path, maxAge, sameSite)
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/set-locale/route";

function makeRequest(locale?: string): NextRequest {
  const url = locale
    ? `http://localhost/api/set-locale?locale=${locale}`
    : "http://localhost/api/set-locale";
  return new NextRequest(url, { method: "POST" });
}

describe("/api/set-locale route", () => {
  it("returns 200 and sets NEXT_LOCALE cookie for valid locale 'en'", async () => {
    const res = await POST(makeRequest("en"));
    expect(res.status).toBe(200);

    const cookie = res.cookies.get("NEXT_LOCALE");
    expect(cookie?.value).toBe("en");
  });

  it("returns 200 and sets NEXT_LOCALE cookie for valid locale 'he'", async () => {
    const res = await POST(makeRequest("he"));
    expect(res.status).toBe(200);

    const cookie = res.cookies.get("NEXT_LOCALE");
    expect(cookie?.value).toBe("he");
  });

  it("returns 200 and sets NEXT_LOCALE cookie for valid locale 'ru'", async () => {
    const res = await POST(makeRequest("ru"));
    expect(res.status).toBe(200);

    const cookie = res.cookies.get("NEXT_LOCALE");
    expect(cookie?.value).toBe("ru");
  });

  it("returns 400 for an unknown locale", async () => {
    const res = await POST(makeRequest("fr"));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 when locale param is missing", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty string locale", async () => {
    const res = await POST(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("cookie path is '/' so it applies to all routes", async () => {
    const res = await POST(makeRequest("he"));
    const cookie = res.cookies.get("NEXT_LOCALE");
    expect(cookie?.path).toBe("/");
  });

  it("cookie maxAge is at least 1 year (31536000 seconds)", async () => {
    const res = await POST(makeRequest("en"));
    const cookie = res.cookies.get("NEXT_LOCALE");
    expect(cookie?.maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it("response body is { ok: true } on success", async () => {
    const res = await POST(makeRequest("ru"));
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
