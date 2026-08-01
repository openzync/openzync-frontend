import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyEmailPage from "@/app/verify-email/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams("email=new@example.com");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/verify-email",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockSearchParams = new URLSearchParams("email=new@example.com");
  mockFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("VerifyEmailPage", () => {
  it("renders the verify email form", () => {
    render(<VerifyEmailPage />);

    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(
      screen.getByText(/We sent a verification code to/),
    ).toBeInTheDocument();
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("000000"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify Email" }),
    ).toBeInTheDocument();
  });

  it("renders back to sign up link", () => {
    render(<VerifyEmailPage />);
    expect(
      screen.getByRole("link", { name: /back to sign up/i }),
    ).toBeInTheDocument();
  });

  it("shows warning when no email param is provided", () => {
    mockSearchParams = new URLSearchParams("");
    render(<VerifyEmailPage />);
    expect(
      screen.getByText(/No email provided/),
    ).toBeInTheDocument();
    // Two links with "sign up" text — "Back to sign up" and a standalone one
    const links = screen.getAllByRole("link", { name: /sign up/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("has OTP input with numeric mode and maxLength 6", () => {
    render(<VerifyEmailPage />);
    const input = screen.getByPlaceholderText("000000");
    expect(input).toHaveAttribute("inputMode", "numeric");
    expect(input).toHaveAttribute("maxLength", "6");
    expect(input).toHaveAttribute("placeholder", "000000");
  });

  it("disables submit button when OTP is not 6 digits", () => {
    render(<VerifyEmailPage />);
    const btn = screen.getByRole("button", { name: "Verify Email" });
    expect(btn).toBeDisabled();
  });

  it("enables submit button when OTP is 6 digits", async () => {
    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    const otpInput = screen.getByPlaceholderText("000000");
    await user.type(otpInput, "123456");

    expect(
      screen.getByRole("button", { name: "Verify Email" }),
    ).not.toBeDisabled();
  });

  it("redirects to onboarding on successful verification", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<VerifyEmailPage />);
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify Email" }));

    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    expect(sessionStorage.getItem("mg_access_token")).toBe("access-token");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("refresh-token");
  });

  it("shows error on failed verification", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "Invalid or expired verification code." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<VerifyEmailPage />);
    await user.type(screen.getByPlaceholderText("000000"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify Email" }));

    expect(
      await screen.findByText("Invalid or expired verification code."),
    ).toBeInTheDocument();
  });

  it("shows resend confirmation after resend", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<VerifyEmailPage />);
    const resendBtn = screen.getByText("Resend");
    await user.click(resendBtn);

    // After clicking, should show cooldown text and confirmation
    expect(
      await screen.findByText("A new verification code has been sent."),
    ).toBeInTheDocument();
  });
});
