import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import HomePage from "@/app/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockReplace.mockReset();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HomePage gate", () => {
  it("503 needs_setup → /setup", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          needs_setup: true,
          degraded: { platform_seed: "Platform not initialised." },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/setup");
    });
  });

  it("200 seeded → /overview", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ needs_setup: false, degraded: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });
  });

  it("fetch failure → /overview", async () => {
    mockFetch.mockRejectedValueOnce(new Error("down"));
    render(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });
  });
});
