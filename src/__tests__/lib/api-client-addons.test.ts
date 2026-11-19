import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAddon,
  upgradeAddon,
  deleteAddon,
  addonHealth,
  requestPanelTicket,
  listAddons,
  ApiError,
  clearTokens,
} from "@/lib/api-client";

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ADDON = {
  id: "democrm",
  version: "1.0.0",
  source_type: "local",
  source_ref: "addons/democrm",
  installed_sha: "local-abc",
  latest_seen: "1.0.0",
  enabled: true,
  update_available: false,
  generation: 3,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  panels: [{ id: "board", title: "Board", path: "/ui/board.html" }],
};

beforeEach(() => {
  mockFetch.mockReset();
  clearTokens();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getAddon ────────────────────────────────────────────────────────────────────

describe("getAddon", () => {
  it("hits the real endpoint and returns the add-on", async () => {
    mockFetch.mockResolvedValueOnce(ok(ADDON));
    const addon = await getAddon("democrm");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/admin/system/addons/democrm")).toBe(true);
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
    expect(addon.id).toBe("democrm");
    expect(addon.panels).toHaveLength(1);
  });

  it("encodes the id in the path", async () => {
    mockFetch.mockResolvedValueOnce(ok(ADDON));
    await getAddon("my addon/x");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/admin/system/addons/my%20addon%2Fx")).toBe(true);
  });

  it("maps 404 to ApiError with isNotFound", async () => {
    mockFetch.mockResolvedValueOnce(ok({ detail: "not found" }, 404));
    const err = await getAddon("nope").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNotFound).toBe(true);
    expect((err as ApiError).status).toBe(404);
  });
});

// ─── upgradeAddon ────────────────────────────────────────────────────────────────

describe("upgradeAddon", () => {
  it("appends ?tag= when a tag is given", async () => {
    mockFetch.mockResolvedValueOnce(ok(ADDON));
    await upgradeAddon("democrm", "v2.0.0");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/admin/system/addons/democrm/upgrade?tag=v2.0.0")).toBe(true);
  });

  it("trims and encodes the tag", async () => {
    mockFetch.mockResolvedValueOnce(ok(ADDON));
    await upgradeAddon("democrm", "  v2 beta  ");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("upgrade?tag=v2%20beta")).toBe(true);
  });

  it("omits ?tag= when blank or undefined", async () => {
    for (const tag of [undefined, "", "   "]) {
      mockFetch.mockResolvedValueOnce(ok(ADDON));
      await upgradeAddon("democrm", tag);
      const [url] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      expect(url.endsWith("/admin/system/addons/democrm/upgrade")).toBe(true);
      expect(url).not.toContain("?tag=");
    }
  });
});

// ─── deleteAddon ─────────────────────────────────────────────────────────────────

describe("deleteAddon", () => {
  it("always sends confirm=true (the type-the-id gate lives client-side)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteAddon("democrm", true);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const query = url.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    expect(params.get("confirm")).toBe("true");
    expect(params.get("remove_data")).toBe("true");
  });

  it("passes remove_data=false through with confirm=true", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteAddon("democrm", false);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    expect(params.get("confirm")).toBe("true");
    expect(params.get("remove_data")).toBe("false");
  });
});

// ─── addonHealth ─────────────────────────────────────────────────────────────────

describe("addonHealth", () => {
  it("returns the health shape", async () => {
    const health = {
      id: "democrm",
      enabled: true,
      loaded: true,
      generation: 3,
      version: "1.0.0",
    };
    mockFetch.mockResolvedValueOnce(ok(health));
    const res = await addonHealth("democrm");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/admin/system/addons/democrm/health")).toBe(true);
    expect(res).toEqual(health);
  });
});

// ─── requestPanelTicket ──────────────────────────────────────────────────────────

describe("requestPanelTicket", () => {
  it("posts the panel path and returns the ticket", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ticket: "T" }));
    const res = await requestPanelTicket("democrm", "/ui/board.html");
    expect(res).toEqual({ ticket: "T" });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/admin/system/addons/democrm/panels/ticket")).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({ panel_path: "/ui/board.html" });
  });
});

// ─── listAddons ──────────────────────────────────────────────────────────────────

describe("listAddons", () => {
  it("returns data + total", async () => {
    mockFetch.mockResolvedValueOnce(ok({ data: [ADDON], total: 1 }));
    const res = await listAddons();
    expect(res.total).toBe(1);
    expect(res.data[0].id).toBe("democrm");
  });
});
