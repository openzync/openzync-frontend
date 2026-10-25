import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  get,
  post,
  storeTokens,
  clearTokens,
  uploadWithBlobs,
} from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  clearTokens();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tokenStorage single-swap", () => {
  it("storeTokens persists exactly the access+refresh pair", () => {
    storeTokens("a1", "r1");
    expect(localStorage.getItem("mg_access_token")).toBe("a1");
    expect(localStorage.getItem("mg_refresh_token")).toBe("r1");
    expect(Object.keys(localStorage).sort()).toEqual([
      "mg_access_token",
      "mg_refresh_token",
    ]);
  });

  it("clearTokens removes exactly the token pair", () => {
    storeTokens("a1", "r1");
    clearTokens();
    expect(localStorage.getItem("mg_access_token")).toBeNull();
    expect(localStorage.getItem("mg_refresh_token")).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]);
  });
});

describe("credentials:include", () => {
  it("GET sends credentials:include", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await get("/v1/probe");
    expect(mockFetch.mock.calls[0][1].credentials).toBe("include");
  });

  it("POST sends credentials:include", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await post("/v1/probe", {});
    expect(mockFetch.mock.calls[0][1].credentials).toBe("include");
  });

  it("uploadWithBlobs sends credentials:include", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await uploadWithBlobs("/v1/x/memory", { messages: [] }, []);
    expect(mockFetch.mock.calls[0][1].credentials).toBe("include");
  });
});

describe("GET cache expiry + LRU", () => {
  it("expired entries are deleted and refetched", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    mockFetch.mockResolvedValueOnce(jsonResponse({ v: 1 }));
    await expect(get("/v1/cached")).resolves.toEqual({ v: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Within TTL — served from cache, no new fetch.
    now.mockReturnValue(1_000_000 + 10_000);
    await expect(get("/v1/cached")).resolves.toEqual({ v: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Past the 30s TTL — entry is deleted, refetched from network.
    now.mockReturnValue(1_000_000 + 31_000);
    mockFetch.mockResolvedValueOnce(jsonResponse({ v: 2 }));
    await expect(get("/v1/cached")).resolves.toEqual({ v: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("evicts the least-recently-read entry past 200 entries", async () => {
    mockFetch.mockImplementation(async (url: RequestInfo | URL) =>
      jsonResponse({ url: String(url) }),
    );
    for (let i = 0; i < 200; i++) {
      await get(`/v1/item-${i}`);
    }
    expect(mockFetch).toHaveBeenCalledTimes(200);

    // Re-read item-0 so item-1 becomes the LRU victim, then add one more.
    await get("/v1/item-0");
    expect(mockFetch).toHaveBeenCalledTimes(200);
    await get("/v1/item-200");
    expect(mockFetch).toHaveBeenCalledTimes(201);

    // item-0 survived (recently read); item-1 was evicted and refetches.
    await get("/v1/item-0");
    expect(mockFetch).toHaveBeenCalledTimes(201);
    await get("/v1/item-1");
    expect(mockFetch).toHaveBeenCalledTimes(202);
  });
});

describe("GET cache identity rules", () => {
  it("/v1/auth/me bypasses the GET cache", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: "u" }));
    await get("/v1/auth/me");
    await get("/v1/auth/me");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("mutations clear the GET cache", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ v: 1 }));
    await expect(get("/v1/things")).resolves.toEqual({ v: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await expect(get("/v1/things")).resolves.toEqual({ v: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await post("/v1/things", { name: "x" });

    mockFetch.mockResolvedValueOnce(jsonResponse({ v: 2 }));
    await expect(get("/v1/things")).resolves.toEqual({ v: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("identity change clears the GET cache", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ v: 1 }));
    await get("/v1/things");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await get("/v1/things");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    storeTokens("new-a", "new-r");
    mockFetch.mockResolvedValueOnce(jsonResponse({ v: 2 }));
    await get("/v1/things");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
