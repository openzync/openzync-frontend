import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { API_BASE, clearTokens, getAccessToken } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Seeded default: /ready resolves needs_setup:false (banner hidden). */
function mockDefaultFetch(): void {
  mockFetch.mockImplementation((input: RequestInfo | URL) =>
    String(input).endsWith("/ready")
      ? Promise.resolve(jsonResponse({ needs_setup: false }))
      : Promise.reject(new Error(`unexpected fetch: ${String(input)}`)),
  );
}

/** Route /ready to the seeded default and /v1/auth/login to a canned body. */
function mockLoginFetch(body: unknown, status = 200): void {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/ready")) return Promise.resolve(jsonResponse({ needs_setup: false }));
    if (url.endsWith("/v1/auth/login")) return Promise.resolve(jsonResponse(body, status));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  mockDefaultFetch();
  mockPush.mockReset();
  mockReplace.mockReset();
  // Reset the api-client in-memory token cache as well as storage: a prior
  // test's successful login would otherwise leak its token into this test's
  // pre-auth /v1/auth/login request via getAuthHeaders().
  clearTokens();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  it("renders the login form with all required fields", () => {
    render(<LoginPage />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in to your personal dashboard"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("you@example.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter your password"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign In" }),
    ).toBeInTheDocument();
  });

  it("renders forgot password link", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("link", { name: /forgot password/i }),
    ).toBeInTheDocument();
  });

  it("renders sign up link", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("link", { name: /sign up/i }),
    ).toBeInTheDocument();
  });

  it("renders magic code sign-in link", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("link", { name: /magic code/i }),
    ).toBeInTheDocument();
  });

  it("renders OpenZync brand on mobile and desktop", () => {
    render(<LoginPage />);
    const headings = screen.getAllByText("OpenZync");
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it("associates labels with inputs via htmlFor/id", () => {
    render(<LoginPage />);
    // The platform root user signs in with the literal "root", so the
    // field is "Email or username" — not "Email".
    expect(screen.getByLabelText("Email or username")).toHaveAttribute(
      "id",
      "login-email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute("id", "login-password");
  });

  it("toggles password visibility with accessible state", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText("Password");
    const toggleBtn = screen.getByRole("button", { name: "Show password" });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(toggleBtn);

    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("has email input with correct attributes", () => {
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText("you@example.com");
    expect(emailInput).toHaveAttribute("type", "text");
    expect(emailInput).toHaveAttribute("required");
    expect(emailInput).toHaveAttribute("placeholder", "you@example.com");
  });

  it("has password input with correct attributes", () => {
    render(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveAttribute("required");
    expect(passwordInput).toHaveAttribute(
      "placeholder",
      "Enter your password",
    );
  });

  it("submits form and redirects to overview on success", async () => {
    const user = userEvent.setup();
    mockLoginFetch({
      access_token: "access123",
      refresh_token: "refresh123",
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockReplace).toHaveBeenCalledWith("/overview");
    expect(getAccessToken()).toBe("access123");
    expect(localStorage.getItem("mg_access_token")).toBeNull();
    expect(localStorage.getItem("mg_refresh_token")).toBe("refresh123");
  });

  it("allows root user to sign in with non-email identifier", async () => {
    const user = userEvent.setup();
    mockLoginFetch({
      access_token: "access123",
      refresh_token: "refresh123",
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "root");
    await user.type(screen.getByPlaceholderText("Enter your password"), "root-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/v1/auth/login`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "root", password: "root-password" }),
      }),
    );

    // The submit must run to completion, not just reach fetch(): a
    // type="email" input would have been blocked by HTML5 validation and
    // "root" would never have been sent at all.
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });
    expect(getAccessToken()).toBe("access123");
    expect(localStorage.getItem("mg_access_token")).toBeNull();
    expect(localStorage.getItem("mg_refresh_token")).toBe("refresh123");
  }, 20_000);

  it("redirects to MFA page when requires_mfa is true", async () => {
    const user = userEvent.setup();
    mockLoginFetch({
      requires_mfa: true,
      mfa_session_token: "mfa-session-xyz",
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/login/mfa?email=test%40example.com&session=mfa-session-xyz",
    );
  });

  it("shows error message on failed login", async () => {
    const user = userEvent.setup();
    mockLoginFetch({ detail: "Invalid email or password." }, 401);

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "wrong@example.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(
      await screen.findByText("Invalid email or password."),
    ).toBeInTheDocument();
  });

  it("shows generic error on network failure", async () => {
    const user = userEvent.setup();
    // When fetch throws a non-Error (e.g. network issue), err.message is undefined
    // so the page falls back to "Connection error. Please try again."
    // Route-aware: /ready stays seeded, only the login POST throws.
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/ready")) return Promise.resolve(jsonResponse({ needs_setup: false }));
      return Promise.reject({});
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(
      await screen.findByText("Connection error. Please try again."),
    ).toBeInTheDocument();
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();
    // Route-aware: /ready stays seeded, only the login POST hangs.
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/ready")) return Promise.resolve(jsonResponse({ needs_setup: false }));
      return new Promise(() => {});
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password");
    // Capture button ref before clicking — the button text changes to a spinner
    // when submitting, so the name query would fail after click
    const btn = screen.getByRole("button", { name: "Sign In" });
    await user.click(btn);

    expect(btn).toBeDisabled();
  });

  it("shows the first-run banner linking to /setup when needs_setup is true", async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) =>
      String(input).endsWith("/ready")
        ? Promise.resolve(jsonResponse({ needs_setup: true }))
        : Promise.reject(new Error(`unexpected fetch: ${String(input)}`)),
    );

    render(<LoginPage />);

    expect(await screen.findByText("First run?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "here" })).toHaveAttribute("href", "/setup");
  });
});
