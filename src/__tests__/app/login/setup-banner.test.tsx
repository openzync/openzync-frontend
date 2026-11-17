import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
let searchString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchString),
  usePathname: () => "/login",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function readyResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockReplace.mockReset();
  mockFetch.mockReset();
  searchString = "";
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LoginPage setup banner", () => {
  it("503 needs_setup → banner with /setup link, no redirect", async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) =>
      String(input).endsWith("/ready")
        ? Promise.resolve(
            readyResponse(
              {
                needs_setup: true,
                degraded: { platform_seed: "Platform not initialised." },
              },
              503,
            ),
          )
        : Promise.reject(new Error(`unexpected fetch: ${String(input)}`)),
    );
    render(<LoginPage />);

    const link = await screen.findByRole("link", { name: "here" });
    expect(link).toHaveAttribute("href", "/setup");
    expect(screen.getByText("First run?")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("200 seeded → no banner", async () => {
    mockFetch.mockResolvedValue(readyResponse({ needs_setup: false, degraded: {} }));
    render(<LoginPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/ready"),
      );
    });
    expect(screen.queryByText("First run?")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("fetch failure → no banner", async () => {
    mockFetch.mockRejectedValue(new Error("down"));
    render(<LoginPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    // Banner appears only after a positive needs_setup answer.
    await waitFor(() => {
      expect(screen.queryByText("First run?")).not.toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("?reason=setup-complete → success banner", async () => {
    searchString = "reason=setup-complete";
    mockFetch.mockResolvedValue(readyResponse({ needs_setup: false, degraded: {} }));
    render(<LoginPage />);

    expect(await screen.findByText("Root account created")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
