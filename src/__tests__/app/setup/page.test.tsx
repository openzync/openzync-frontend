import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SetupPage from "@/app/setup/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/setup",
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

/** Route fetch by URL: /ready for the gate, /v1/auth/setup for submit. */
function mockReady(body: unknown, status = 200): void {
  mockFetch.mockImplementation((input: RequestInfo | URL) =>
    String(input).endsWith("/ready")
      ? Promise.resolve(jsonResponse(body, status))
      : Promise.reject(new Error(`unexpected fetch: ${String(input)}`)),
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Gate: GET /ready ─────────────────────────────────────────────────────────

describe("SetupPage gate", () => {
  it("shows the form on 503 needs_setup", async () => {
    mockReady(
      {
        needs_setup: true,
        degraded: { platform_seed: "Platform not initialised." },
      },
      503,
    );
    render(<SetupPage />);

    expect(await screen.findByText("Create the root account")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to /login when already seeded", async () => {
    mockReady({ needs_setup: false, degraded: {} });
    render(<SetupPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("shows the failed phase on network throw and Retry refetches", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error("down"));

    render(<SetupPage />);
    expect(await screen.findByText(/can't reach the platform/i)).toBeInTheDocument();

    mockReady({ needs_setup: true }, 503);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Create the root account")).toBeInTheDocument();
  });

  it("shows the failed phase on a non-JSON body", async () => {
    mockFetch.mockResolvedValueOnce(new Response("not json", { status: 503 }));
    render(<SetupPage />);

    expect(await screen.findByText(/can't reach the platform/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ─── Submit ───────────────────────────────────────────────────────────────────

describe("SetupPage submit", () => {
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Root password"), "StrongPass1");
    await user.type(screen.getByLabelText("Confirm password"), "StrongPass1");
    await user.click(screen.getByRole("button", { name: "Create root account" }));
  }

  it("201 → /login?reason=setup-complete", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/ready")) return Promise.resolve(jsonResponse({ needs_setup: true }, 503));
      if (url.endsWith("/v1/auth/setup") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ message: "Platform root created." }, 201));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<SetupPage />);
    await screen.findByText("Create the root account");
    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?reason=setup-complete");
    });
  });

  it("403 → /login (someone else finished setup first)", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/ready")) return Promise.resolve(jsonResponse({ needs_setup: true }, 503));
      if (url.endsWith("/v1/auth/setup")) {
        return Promise.resolve(jsonResponse({ detail: "Platform setup is not available." }, 403));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<SetupPage />);
    await screen.findByText("Create the root account");
    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("422 → inline error, no redirect", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/ready")) return Promise.resolve(jsonResponse({ needs_setup: true }, 503));
      if (url.endsWith("/v1/auth/setup")) {
        return Promise.resolve(
          jsonResponse({ detail: "Password must contain at least one uppercase letter." }, 422),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<SetupPage />);
    await screen.findByText("Create the root account");
    await fillAndSubmit(user);

    expect(await screen.findByText(/uppercase/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("short password blocks submit client-side", async () => {
    const user = userEvent.setup();
    mockReady({ needs_setup: true }, 503);

    render(<SetupPage />);
    await screen.findByText("Create the root account");
    await user.type(screen.getByLabelText("Root password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Create root account" }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/setup"),
      expect.anything(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("mismatched passwords block submit client-side", async () => {
    const user = userEvent.setup();
    mockReady({ needs_setup: true }, 503);

    render(<SetupPage />);
    await screen.findByText("Create the root account");
    await user.type(screen.getByLabelText("Root password"), "StrongPass1");
    await user.type(screen.getByLabelText("Confirm password"), "Different99");
    await user.click(screen.getByRole("button", { name: "Create root account" }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/setup"),
      expect.anything(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
