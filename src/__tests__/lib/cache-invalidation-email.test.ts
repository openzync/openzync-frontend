import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeEmail, isValidEmail } from "@/lib/api-client";

describe("cache invalidation on token change + email table", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Example.COM  ")).toBe("foo@example.com");
  });

  it.each([
    ["user@example.com", true],
    ["USER@EXAMPLE.COM", true],
    ["  spaced@example.com  ", false],
    ["no-at-sign", false],
    ["a@b", false],
    ["", false],
  ])("isValidEmail(%s) -> %s", (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });

  it("storeTokens and clearTokens wipe the GET cache", async () => {
    const mod = await import("@/lib/api-client");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    localStorage.setItem("mg_access_token", "a");
    localStorage.setItem("mg_refresh_token", "r");
    await mod.get("/v1/projects");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await mod.get("/v1/projects");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    mod.storeTokens("new-a", "new-r");
    await mod.get("/v1/projects");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    mod.clearTokens();
    localStorage.setItem("mg_access_token", "a2");
    localStorage.setItem("mg_refresh_token", "r2");
    await mod.get("/v1/projects");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("/v1/auth/me bypasses the GET cache", async () => {
    const mod = await import("@/lib/api-client");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "u" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    localStorage.setItem("mg_access_token", "a");
    localStorage.setItem("mg_refresh_token", "r");
    await mod.get("/v1/auth/me");
    await mod.get("/v1/auth/me");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
