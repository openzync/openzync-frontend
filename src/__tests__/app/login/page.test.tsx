import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { API_BASE } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  it("renders the login form with all required fields", () => {
    render(<LoginPage />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in to your organization dashboard"),
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

  it("shows password toggle button", () => {
    render(<LoginPage />);
    const toggleBtn = screen.getByRole("button", {
      name: "",
    });
    expect(toggleBtn).toBeInTheDocument();
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
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "access123",
          refresh_token: "refresh123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockReplace).toHaveBeenCalledWith("/overview");
    expect(sessionStorage.getItem("mg_access_token")).toBe("access123");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("refresh123");
  });

  it("allows root user to sign in with non-email identifier", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "access123",
          refresh_token: "refresh123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

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
  });

  it("redirects to MFA page when requires_mfa is true", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          requires_mfa: true,
          mfa_session_token: "mfa-session-xyz",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

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
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

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
    mockFetch.mockRejectedValueOnce({});

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
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password");
    // Capture button ref before clicking — the button text changes to a spinner
    // when submitting, so the name query would fail after click
    const btn = screen.getByRole("button", { name: "Sign In" });
    await user.click(btn);

    expect(btn).toBeDisabled();
  });
});
