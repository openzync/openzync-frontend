import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  get,
  post,
  put,
  patch,
  del,
  ApiError,
  extractList,
  getAccessToken,
  storeTokens,
  clearTokens,
  API_BASE,
  uploadWithBlobs,
} from "@/lib/api-client";

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── ApiError ────────────────────────────────────────────────────────────────────

describe("ApiError", () => {
  it("stores status, message, and body", () => {
    const err = new ApiError("Not found", 404, { detail: "missing" });
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ detail: "missing" });
    expect(err.name).toBe("ApiError");
  });

  it("isUnauthorized returns true for 401", () => {
    expect(new ApiError("", 401, null).isUnauthorized).toBe(true);
    expect(new ApiError("", 403, null).isUnauthorized).toBe(false);
  });

  it("isForbidden returns true for 403", () => {
    expect(new ApiError("", 403, null).isForbidden).toBe(true);
    expect(new ApiError("", 401, null).isForbidden).toBe(false);
    expect(new ApiError("", 500, null).isForbidden).toBe(false);
  });

  it("isNotFound returns true for 404", () => {
    expect(new ApiError("", 404, null).isNotFound).toBe(true);
    expect(new ApiError("", 400, null).isNotFound).toBe(false);
  });

  it("isRateLimited returns true for 429", () => {
    expect(new ApiError("", 429, null).isRateLimited).toBe(true);
    expect(new ApiError("", 500, null).isRateLimited).toBe(false);
  });

  it("isServerError returns true for 500+", () => {
    expect(new ApiError("", 500, null).isServerError).toBe(true);
    expect(new ApiError("", 502, null).isServerError).toBe(true);
    expect(new ApiError("", 400, null).isServerError).toBe(false);
  });
});

// ─── Auth token helpers (via re-exported getAccessToken / clearTokens) ────────────

describe("auth token helpers", () => {
  it("getAccessToken returns null when no token stored", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("getAccessToken returns stored token", () => {
    sessionStorage.setItem("mg_access_token", "test-token");
    expect(getAccessToken()).toBe("test-token");
  });

  it("clearTokens removes both tokens", () => {
    sessionStorage.setItem("mg_access_token", "a");
    sessionStorage.setItem("mg_refresh_token", "b");
    clearTokens();
    expect(sessionStorage.getItem("mg_access_token")).toBeNull();
    expect(sessionStorage.getItem("mg_refresh_token")).toBeNull();
  });

  it("storeTokens writes both tokens", () => {
    storeTokens("access-1", "refresh-1");
    expect(sessionStorage.getItem("mg_access_token")).toBe("access-1");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("refresh-1");
  });
});

// ─── Core request helper (via get / post / put / patch / del) ─────────────────────

describe("request helpers", () => {
  it("get sends a GET request and returns parsed JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await get<{ data: string }>("/v1/test");
    expect(result).toEqual({ data: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/test`);
    expect(opts.method).toBe("GET");
  });

  it("post sends a POST with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await post<{ id: number }>("/v1/test", { name: "foo" });
    expect(result).toEqual({ id: 1 });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      name: "foo",
    });
  });

  it("post sends without body when data is undefined", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await post("/v1/test");
    expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
  });

  it("put sends a PUT with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await put("/v1/test", { value: 2 });
    expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ value: 2 });
  });

  it("patch sends a PATCH with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await patch("/v1/test", { field: "val" });
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("del sends a DELETE request", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 204,
      }),
    );
    const result = await del("/v1/test");
    expect(result).toEqual({});
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("sets Authorization header when access token exists", async () => {
    sessionStorage.setItem("mg_access_token", "mytoken");
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await get("/v1/test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer mytoken");
  });

  it("does not set Authorization header when no token", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await get("/v1/test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

// ─── Error handling ─────────────────────────────────────────────────────────────

describe("request error handling", () => {
  it("throws ApiError on 400 with message from body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Bad request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const promise = get("/v1/test");
    await expect(promise).rejects.toThrow(ApiError);
    await expect(promise).rejects.toThrow("Bad request");
  });

  it("falls back to detail field for error message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(get("/v1/test")).rejects.toThrow("Not found");
  });

  it("uses status text fallback when no message or detail field", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(get("/v1/test")).rejects.toThrow(
      "Request failed with status 500",
    );
  });

  it("handles non-JSON error response body gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("plain text error", {
        status: 500,
      }),
    );
    await expect(get("/v1/test")).rejects.toThrow(
      "Request failed with status 500",
    );
  });

  it("returns empty object on 204 no content", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await get("/v1/test");
    expect(result).toEqual({});
  });

  it("throws ApiError with correct status on 409 conflict", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Conflict" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    try {
      await post("/v1/test", {});
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
    }
  });
});

// ─── apiErrorMessage (via request helpers) ─────────────────────────────────────

describe("apiErrorMessage via request helpers", () => {
  it("flattens a FastAPI 422 validation array into a readable field message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: [
            {
              loc: ["body", "messages", 0, "content"],
              msg: "Field required",
              type: "missing",
            },
          ],
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const promise = post("/v1/projects/p/memory", { messages: [] });
    await expect(promise).rejects.toThrow(ApiError);
    await expect(promise).rejects.toThrow("messages.0.content: Field required");
  });

  it("uses string detail as message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(get("/v1/test")).rejects.toThrow("boom");
  });

  it("uses RFC 7807 title as message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ title: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(get("/v1/test")).rejects.toThrow("Rate limited");
  });

  it("unwraps the nested detail object on permission denials (403)", async () => {
    // FastAPI permission errors arrive as {"detail": {"detail": "..."}}.
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: {
            detail: "This action requires the 'configuration:read' permission.",
          },
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await expect(get("/v1/test")).rejects.toThrow(
      "This action requires the 'configuration:read' permission.",
    );
  });

  it("unwraps a nested detail.message too", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: "nested message" } }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await expect(get("/v1/test")).rejects.toThrow("nested message");
  });

  it("falls back to status text for non-JSON error bodies", async () => {
    mockFetch.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    await expect(get("/v1/test")).rejects.toThrow(
      "Request failed with status 502",
    );
  });
});

// ─── 401 token refresh ──────────────────────────────────────────────────────────

describe("401 token refresh", () => {
  beforeEach(() => {
    sessionStorage.setItem("mg_access_token", "expired-token");
    sessionStorage.setItem("mg_refresh_token", "valid-refresh");
  });

  it("retries request after successful token refresh", async () => {
    // First call: 401
    // Refresh call: returns new token
    // Retry call: 200
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "retried" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await get<{ data: string }>("/v1/test");
    expect(result).toEqual({ data: "retried" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Verify the retry used the new token
    const retryHeaders = mockFetch.mock.calls[2][1].headers;
    expect(retryHeaders["Authorization"]).toBe("Bearer new-access");
  });

  it("stores new tokens from refresh response", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await get("/v1/test");
    expect(sessionStorage.getItem("mg_access_token")).toBe("new-access");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("new-refresh");
  });

  it("clears tokens and throws when refresh fails", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        // Refresh endpoint returns 400 (invalid refresh token)
        new Response(JSON.stringify({ detail: "Invalid refresh token" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );

    // Prevent window.location.href from navigating (jsdom doesn't support it)
    delete (window as any).location;
    window.location = { href: "" } as any;

    const promise2 = get("/v1/test");
    await expect(promise2).rejects.toThrow(ApiError);
    await expect(promise2).rejects.toThrow("Unauthorized");
    expect(sessionStorage.getItem("mg_access_token")).toBeNull();
    expect(sessionStorage.getItem("mg_refresh_token")).toBeNull();
  });

  it("does not loop if refresh itself returns 401", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    delete (window as any).location;
    window.location = { href: "" } as any;

    await expect(get("/v1/test")).rejects.toThrow(ApiError);
    // Should only have made 2 requests (original + refresh), not infinite
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("shares a single refresh between two parallel 401 requests and both succeed", async () => {
    let refreshCalls = 0;
    const seenPaths = new Set<string>();
    mockFetch.mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/v1/auth/refresh")) {
        refreshCalls++;
        return new Response(
          JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (seenPaths.has(u)) {
        return new Response(JSON.stringify({ ok: u }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      seenPaths.add(u);
      return new Response(null, { status: 401 });
    });

    const [a, b] = await Promise.all([get("/v1/a"), get("/v1/b")]);

    expect(refreshCalls).toBe(1);
    expect(a).toEqual({ ok: `${API_BASE}/v1/a` });
    expect(b).toEqual({ ok: `${API_BASE}/v1/b` });
    // Each path was called exactly twice (original + single retry), and the
    // retry used the refreshed token
    for (const path of ["/v1/a", "/v1/b"]) {
      const calls = mockFetch.mock.calls.filter(
        ([u]) => String(u) === `${API_BASE}${path}`,
      );
      expect(calls).toHaveLength(2);
      expect(calls[1][1].headers["Authorization"]).toBe("Bearer new-access");
    }
    expect(sessionStorage.getItem("mg_access_token")).toBe("new-access");
  });

  it("both parallel requests throw when the shared refresh fails, without a second attempt", async () => {
    // jsdom can't navigate; stub location without `any` casts
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    let refreshCalls = 0;
    mockFetch.mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/v1/auth/refresh")) {
        refreshCalls++;
        return new Response(null, { status: 400 });
      }
      return new Response(null, { status: 401 });
    });

    const results = await Promise.allSettled([get("/v1/a"), get("/v1/b")]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(
      mockFetch.mock.calls.filter(([u]) =>
        String(u).endsWith("/v1/auth/refresh"),
      ),
    ).toHaveLength(1);
    expect(sessionStorage.getItem("mg_access_token")).toBeNull();
  });
});

// ─── skipAuthRetry (pre-auth endpoints) ────────────────────────────────────────

describe("skipAuthRetry", () => {
  // jsdom can't navigate; stub location so a stray redirect is observable.
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
    sessionStorage.setItem("mg_access_token", "stale-access");
    sessionStorage.setItem("mg_refresh_token", "valid-refresh");
  });

  it("surfaces the 401 as ApiError without refresh, retry, token clearing, or redirect", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const promise = post("/v1/auth/login", { email: "a@b.com", password: "nope" }, { skipAuthRetry: true });
    await expect(promise).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Invalid email or password.",
    });

    // Exactly one HTTP call — no /v1/auth/refresh, no retry of the original.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Tokens survive (user may just have mistyped their password).
    expect(sessionStorage.getItem("mg_access_token")).toBe("stale-access");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("valid-refresh");
    // No redirect-to-login side effect.
    expect(window.location.href).toBe("");
  });

  it("still refresh-and-retries when the flag is omitted (default authenticated behaviour)", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await post<{ ok: boolean }>("/v1/thing", {});
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ─── uploadWithBlobs ──────────────────────────────────────────────────────────────

describe("uploadWithBlobs", () => {
  const payload = { messages: [{ role: "user", content: "hi" }] };

  it("sends multipart FormData without a Content-Type header", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await uploadWithBlobs<{ ok: boolean }>(
      "/v1/x/memory",
      payload,
      [],
    );
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/x/memory`);
    expect(opts.method).toBe("POST");

    // No content-type header (case-insensitive) — the browser must set the
    // multipart/form-data boundary, otherwise FastAPI refuses the form (422).
    const headerNames = Object.keys(opts.headers).map((h) => h.toLowerCase());
    expect(headerNames).not.toContain("content-type");

    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body as FormData).get("data")).toBe(JSON.stringify(payload));
  });

  it("appends each file as a separate blob entry", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });

    await uploadWithBlobs("/v1/x/memory", payload, [file]);

    const body = mockFetch.mock.calls[0][1].body as FormData;
    const blobs = body.getAll("blobs");
    expect(blobs).toHaveLength(1);
    expect(blobs[0]).toBe(file);
  });

  it("keeps Authorization but omits Content-Type on 401 refresh retry", async () => {
    sessionStorage.setItem("mg_access_token", "expired-token");
    sessionStorage.setItem("mg_refresh_token", "valid-refresh");
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await uploadWithBlobs<{ ok: boolean }>(
      "/v1/x/memory",
      payload,
      [],
    );
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const retryHeaders = mockFetch.mock.calls[2][1].headers;
    expect(retryHeaders["Authorization"]).toBe("Bearer new-access");
    const retryHeaderNames = Object.keys(retryHeaders).map((h) => h.toLowerCase());
    expect(retryHeaderNames).not.toContain("content-type");
  });
});

// ─── extractList ─────────────────────────────────────────────────────────────────

describe("extractList", () => {
  it("returns bare array as-is", () => {
    expect(extractList([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("extracts from data field", () => {
    expect(extractList({ data: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("extracts from items field", () => {
    expect(extractList({ items: ["x", "y"] })).toEqual(["x", "y"]);
  });

  it("data field takes precedence over items", () => {
    expect(
      extractList({ data: ["from-data"], items: ["from-items"] }),
    ).toEqual(["from-data"]);
  });

  it("returns empty array for empty object", () => {
    expect(extractList({})).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(extractList(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(extractList(undefined)).toEqual([]);
  });
});

// ─── join (org-code signup) ──────────────────────────────────────────────────────

describe("join", () => {
  it("posts email, password, and org_code to /v1/auth/join", async () => {
    const { join } = await import("@/lib/api-client");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Verification code sent to email",
          email: "alice@acme.com",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await join({
      email: "alice@acme.com",
      password: "SecurePass1",
      org_code: "GCE3GG9Z",
    });

    expect(result).toEqual({
      message: "Verification code sent to email",
      email: "alice@acme.com",
    });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/auth/join`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      email: "alice@acme.com",
      password: "SecurePass1",
      org_code: "GCE3GG9Z",
    });
  });

  it("throws ApiError with the RFC 7807 detail on 422 invalid code", async () => {
    const { join } = await import("@/lib/api-client");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "https://errors.openzync.tech/validation_error",
          title: "Validation Error",
          status: 422,
          detail: "Invalid organization code",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      join({ email: "a@b.com", password: "SecurePass1", org_code: "BADCODE9" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Invalid organization code",
    });
  });
});

// ─── Invite endpoints (admin invite → magic-link password set) ────────────────

describe("invite endpoints", () => {
  it("getInviteInfo posts the token in the body, never the URL", async () => {
    const { getInviteInfo } = await import("@/lib/api-client");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ org_name: "Acme Corp", email: "alice@acme.com", name: "Alice" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await getInviteInfo("invite-tok-123");
    expect(result).toEqual({
      org_name: "Acme Corp",
      email: "alice@acme.com",
      name: "Alice",
    });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/auth/invites/info`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ token: "invite-tok-123" });
    expect(url).not.toContain("invite-tok-123");
  });

  it("getInviteInfo surfaces the server detail on a bad token", async () => {
    const { getInviteInfo } = await import("@/lib/api-client");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "This invitation link is invalid or has expired." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(getInviteInfo("bad-token")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "This invitation link is invalid or has expired.",
    });
  });

  it("acceptInvite clears stale tokens then stores the new pair", async () => {
    const { acceptInvite } = await import("@/lib/api-client");
    // Stale session from a previous login — must be overwritten, not merged.
    sessionStorage.setItem("mg_access_token", "stale-access");
    sessionStorage.setItem("mg_refresh_token", "stale-refresh");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await acceptInvite("invite-tok-123", "Str0ng!Pass");
    expect(result).toEqual({ access_token: "new-access", refresh_token: "new-refresh" });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/auth/invites/accept`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      token: "invite-tok-123",
      password: "Str0ng!Pass",
    });
    expect(url).not.toContain("invite-tok-123");
    expect(sessionStorage.getItem("mg_access_token")).toBe("new-access");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("new-refresh");
  });

  it("acceptInvite throws the server detail and stores nothing on failure", async () => {
    const { acceptInvite } = await import("@/lib/api-client");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "This invitation link is invalid or has expired." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(acceptInvite("bad-token", "Str0ng!Pass")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "This invitation link is invalid or has expired.",
    });
    expect(sessionStorage.getItem("mg_access_token")).toBeNull();
    expect(sessionStorage.getItem("mg_refresh_token")).toBeNull();
  });

  it("inviteUser posts email+name to the admin endpoint with auth", async () => {
    const { inviteUser } = await import("@/lib/api-client");
    sessionStorage.setItem("mg_access_token", "admin-token");
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 201 }));

    await inviteUser("alice@acme.com", "Alice");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/admin/users/invite`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ email: "alice@acme.com", name: "Alice" });
    expect(opts.headers["Authorization"]).toBe("Bearer admin-token");
  });

  it("revokeInvite DELETEs /v1/admin/users/invites/{id}", async () => {
    const { revokeInvite } = await import("@/lib/api-client");
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await revokeInvite("u-123");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/admin/users/invites/u-123`);
    expect(opts.method).toBe("DELETE");
  });
});
