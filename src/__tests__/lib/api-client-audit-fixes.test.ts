import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  get,
  uploadWithBlobs,
  storeTokens,
  clearTokens,
  AUTH_REDIRECT_EVENT,
  ApiError,
} from "@/lib/api-client";

// ─── Helpers ─────────────────────────────────────────────────────────────────────

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
});

// ─── Audit fixes ───────────────────────────────────────────────────────────────

describe("upload 401 → refresh → retry rebuilds the multipart body", () => {
  it("retries with a fresh FormData carrying the same fields and files", async () => {
    storeTokens("expired-token", "valid-refresh");
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });
    const payload = { messages: [{ role: "user", content: "hi" }] };
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "new", refresh_token: "new-r" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await uploadWithBlobs<{ ok: boolean }>(
      "/v1/x/memory",
      payload,
      [file],
    );

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const firstBody = mockFetch.mock.calls[0][1].body as FormData;
    const retryBody = mockFetch.mock.calls[2][1].body as FormData;
    // A consumed FormData cannot be re-sent — the retry must be a new instance.
    expect(retryBody).toBeInstanceOf(FormData);
    expect(retryBody).not.toBe(firstBody);
    expect(retryBody.get("data")).toBe(JSON.stringify(payload));
    expect(retryBody.getAll("blobs")).toEqual([file]);
    // Retry carries the refreshed token and still no Content-Type.
    const retryHeaders = mockFetch.mock.calls[2][1].headers;
    expect(retryHeaders["Authorization"]).toBe("Bearer new");
    expect(
      Object.keys(retryHeaders).map((h: string) => h.toLowerCase()),
    ).not.toContain("content-type");
  });
});

describe("refresh with no stored token sends {} and re-logins on 422", () => {
  it("dispatches the auth-redirect event and throws Unauthorized", async () => {
    // No token anywhere: memory empty (fresh load) and storage empty.
    const events: string[] = [];
    const listener = (e: Event) =>
      events.push((e as CustomEvent).detail as string);
    window.addEventListener(AUTH_REDIRECT_EVENT, listener);
    try {
      mockFetch
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(
          jsonResponse({ detail: "Field required" }, 422),
        );

      const promise = get("/v1/test");
      await expect(promise).rejects.toThrow(ApiError);
      await expect(promise).rejects.toThrow("Unauthorized");

      // The refresh body must be {} — a missing token is not sent as
      // {"refresh_token": null}.
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const refreshCall = mockFetch.mock.calls.find(([u]) =>
        String(u).endsWith("/v1/auth/refresh"),
      );
      expect(refreshCall).toBeDefined();
      expect(JSON.parse(refreshCall![1].body)).toEqual({});
      // Re-login: event fired, tokens cleared.
      expect(events).toEqual(["/login?reason=not-signed-in"]);
      expect(localStorage.getItem("mg_refresh_token")).toBeNull();
    } finally {
      window.removeEventListener(AUTH_REDIRECT_EVENT, listener);
    }
  });
});
