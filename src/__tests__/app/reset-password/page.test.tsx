import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "@/app/reset-password/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

// Default mock with email param — individual tests override via searchParams mock
let mockSearchParams = new URLSearchParams("email=user@example.com");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/reset-password",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockSearchParams = new URLSearchParams("email=user@example.com");
  mockFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("ResetPasswordPage", () => {
  it("renders the reset password form", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByText("Reset password")).toBeInTheDocument();
    expect(
      screen.getByText(/user@example.com/),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("000000"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Minimum 8 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Repeat your password"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset Password" }),
    ).toBeInTheDocument();
  });

  it("renders back to login link", () => {
    render(<ResetPasswordPage />);
    expect(
      screen.getByRole("link", { name: /back to login/i }),
    ).toBeInTheDocument();
  });

  it("shows warning when no email param is provided", () => {
    mockSearchParams = new URLSearchParams("");
    render(<ResetPasswordPage />);
    expect(
      screen.getByText(/No email provided/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /forgot password/i }),
    ).toBeInTheDocument();
  });

  it("has OTP input with numeric mode and max length 6", () => {
    render(<ResetPasswordPage />);
    const input = screen.getByPlaceholderText("000000");
    expect(input).toHaveAttribute("inputMode", "numeric");
    expect(input).toHaveAttribute("maxLength", "6");
    expect(input).toHaveAttribute("placeholder", "000000");
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "StrongPass1");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "DifferentPass");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(
      screen.getByText("Passwords do not match."),
    ).toBeInTheDocument();
  });

  it("shows error when password is too short", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "Short1");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "Short1");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(
      screen.getByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
  });

  it("shows success and redirects after successful reset", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ResetPasswordPage />);

    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "NewStr0ngPass");
    await user.type(
      screen.getByPlaceholderText("Repeat your password"),
      "NewStr0ngPass",
    );
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    const headings = screen.getAllByText("Password reset successful");
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Redirecting you to login/),
    ).toBeInTheDocument();
  });

  it("shows error on failed reset", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid or expired code" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ResetPasswordPage />);
    await user.type(screen.getByPlaceholderText("000000"), "000000");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "NewStr0ngPass");
    await user.type(
      screen.getByPlaceholderText("Repeat your password"),
      "NewStr0ngPass",
    );
    await user.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(
      await screen.findByText("Invalid or expired code"),
    ).toBeInTheDocument();
  });
});
