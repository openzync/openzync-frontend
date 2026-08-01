import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "@/app/forgot-password/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/forgot-password",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("ForgotPasswordPage", () => {
  it("renders the forgot password form", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter your email and we'll send you a reset code/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send Reset Code" }),
    ).toBeInTheDocument();
  });

  it("renders link back to login", () => {
    render(<ForgotPasswordPage />);
    expect(
      screen.getByRole("link", { name: /back to login/i }),
    ).toBeInTheDocument();
  });

  it("has email input with correct attributes", () => {
    render(<ForgotPasswordPage />);
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("required");
    expect(input).toHaveAttribute("placeholder", "you@example.com");
    // Note: autoFocus is set as a React property, not an HTML attribute in jsdom
  });

  it("shows success message with email on successful request", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ForgotPasswordPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Code" }));

    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(
      screen.getByText(/user@example.com/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /enter reset code/i }),
    ).toBeInTheDocument();
  });

  it("shows error message on failed request", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Email not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ForgotPasswordPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "missing@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Code" }));

    expect(await screen.findByText("Email not found")).toBeInTheDocument();
  });

  it("shows connection error on network failure", async () => {
    const user = userEvent.setup();
    // Non-Error rejection so err is not instanceof Error → hits "Connection error." fallback
    mockFetch.mockRejectedValueOnce("Network error");

    render(<ForgotPasswordPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@test.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Code" }));

    expect(
      await screen.findByText("Connection error."),
    ).toBeInTheDocument();
  });

  it("disables button while submitting", async () => {
    const user = userEvent.setup();
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<ForgotPasswordPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@test.com");
    const btn = screen.getByRole("button", { name: "Send Reset Code" });
    await user.click(btn);

    expect(btn).toBeDisabled();
  });
});
