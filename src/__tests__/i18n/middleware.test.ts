import { describe, it, expect, vi, beforeEach } from "vitest";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";

/**
 * Middleware runs on the Next.js edge runtime, but its only runtime
 * dependencies are NextRequest (URL + cookie header parsing) and
 * NextResponse (cookie setter). Stub both so the negotiation logic is
 * testable in plain jsdom; the mocked cookies API mirrors NextRequest's
 * behavior of deriving cookies from the request "cookie" header.
 */
vi.mock("next/server", () => {
  class NextResponseMock {
    cookies: { set: ReturnType<typeof vi.fn> };
    constructor() {
      this.cookies = { set: vi.fn() };
    }
    static next() {
      return new NextResponseMock();
    }
  }

  class NextRequestMock {
    nextUrl: URL;
    headers: Headers;
    cookies: { get: (name: string) => { value: string } | undefined };
    constructor(input: string, init?: RequestInit) {
      this.nextUrl = new URL(input);
      this.headers = new Headers(init?.headers);
      const parsed: Record<string, string> = {};
      for (const part of (this.headers.get("cookie") ?? "").split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0) parsed[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      }
      this.cookies = {
        get: (name: string) =>
          name in parsed ? { value: parsed[name] } : undefined,
      };
    }
  }

  return { NextResponse: NextResponseMock, NextRequest: NextRequestMock };
});

import { NextRequest, NextResponse } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

/** The mocked response cookies.set, typed as a vi.fn for call assertions. */
function setMock(res: unknown) {
  return vi.mocked(
    (res as { cookies: { set: (name: string, value: string, options?: unknown) => unknown } }).cookies.set,
  );
}

describe("middleware locale negotiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets OZ_LOCALE from Accept-Language when the cookie is absent", () => {
    const res = middleware(req("/overview", { "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" }));

    expect(res).toBeInstanceOf(NextResponse);
    expect(setMock(res)).toHaveBeenCalledTimes(1);
    const [name, value, options] = setMock(res).mock.calls[0];
    expect(name).toBe(LOCALE_COOKIE);
    expect(value).toBe("en");
    expect(options).toMatchObject({
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      httpOnly: false,
      sameSite: "lax",
    });
  });

  it("skips negotiation when a valid cookie is already present", () => {
    const res = middleware(req("/overview", { cookie: `${LOCALE_COOKIE}=en` }));

    expect(res).toBeInstanceOf(NextResponse);
    expect(setMock(res)).not.toHaveBeenCalled();
  });

  it("re-negotiates when the cookie holds an unsupported locale", () => {
    const res = middleware(
      req("/overview", { cookie: `${LOCALE_COOKIE}=xx`, "accept-language": "de-DE,de;q=0.9" }),
    );

    expect(setMock(res)).toHaveBeenCalledTimes(1);
    expect(setMock(res).mock.calls[0][1]).toBe("en"); // de unsupported → default
  });

  it("sets the cookie with the negotiated locale on unsupported cookie + matching header", () => {
    const res = middleware(
      req("/overview", { cookie: `${LOCALE_COOKIE}=xx`, "accept-language": "en-US,en;q=0.9" }),
    );

    expect(setMock(res).mock.calls[0][1]).toBe("en");
  });

  it("never sets a cookie for _next static assets", () => {
    for (const path of [
      "/_next/static/chunks/app-abc123.js",
      "/_next/image?url=/logo.png",
      "/favicon.ico",
      "/logo.svg",
      "/app.css",
    ]) {
      const res = middleware(req(path));
      expect(setMock(res), path).not.toHaveBeenCalled();
    }
  });

  it("never sets a cookie for same-origin API routes (nginx-proxied)", () => {
    for (const path of ["/v1/sessions", "/metrics", "/health"]) {
      const res = middleware(req(path));
      expect(setMock(res), path).not.toHaveBeenCalled();
    }
  });

  it("never redirects — every path returns a plain pass-through response", () => {
    // The middleware body contains no redirect/rewrite calls, so every path
    // yields NextResponse.next(); assert the shape that would distinguish a
    // redirect (302/location) from pass-through (no such props on next()).
    const res = middleware(req("/overview", { "accept-language": "fr" }));
    expect(res).toBeInstanceOf(NextResponse);
    expect("status" in res && res.status === 302).toBe(false);
    expect("location" in res).toBe(false);
  });
});
