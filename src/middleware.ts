import { NextResponse, type NextRequest } from "next/server";
import {
  isSupportedLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  negotiateLocale,
} from "@/i18n/config";

/** Skip asset requests — no cookie negotiation needed for static files. */
const STATIC_FILE = /\.(?:png|svg|ico|jpe?g|gif|webp|avif|css|js|mjs|woff2?|ttf|eot|map)$/i;
/** Same-origin API paths (nginx-proxied) — never set cookies on these. */
const API_PREFIX = /^\/(?:v1|metrics|health)\b/;

/**
 * Locale negotiation: if the OZ_LOCALE cookie is missing or invalid, derive
 * the locale from Accept-Language and set the cookie (maxAge ~1y, httpOnly
 * false, sameSite lax so the client-side language switcher can read/write it).
 *
 * Deliberately does NOT redirect — this app has no URL prefixes; the locale
 * travels in the cookie only.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    STATIC_FILE.test(pathname) ||
    API_PREFIX.test(pathname)
  ) {
    return NextResponse.next();
  }

  const existing = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(existing)) return NextResponse.next();

  const negotiated = negotiateLocale(request.headers.get("accept-language"));
  const response = NextResponse.next();
  response.cookies.set(LOCALE_COOKIE, negotiated, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    httpOnly: false, // client JS (language switcher) must read/write it
    sameSite: "lax",
    // Secure only in prod — browsers drop secure cookies on plain http
    // (localhost dev); NODE_ENV is inlined at build by Next.js.
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Run on all routes except Next.js internals; the body filters assets/API.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
