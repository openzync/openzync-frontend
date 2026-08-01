import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  safeJsonParse,
  get,
  post,
  put,
  patch,
  del,
  ApiError,
  extractList,
  getAccessToken,
  clearTokens,
  API_BASE,
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

// ─── safeJsonParse ───────────────────────────────────────────────────────────────

describe("safeJsonParse", () => {
  it("parses valid JSON", async () => {
    const res = new Response('{"key":"value"}', { status: 200 });
    await expect(safeJsonParse<{ key: string }>(res)).resolves.toEqual({
      key: "value",
    });
  });

  it("throws on invalid JSON with status and preview", async () => {
    const res = new Response("not-json", { status: 500 });
    await expect(safeJsonParse(res)).rejects.toThrow(
      "Failed to parse response (500): not-json",
    );
  });

  it("truncates long response bodies to 200 chars", async () => {
    const long = "a".repeat(500);
    const res = new Response(long, { status: 400 });
    await expect(safeJsonParse(res)).rejects.toThrow(
      "Failed to parse response (400): " + "a".repeat(200),
    );
  });
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
