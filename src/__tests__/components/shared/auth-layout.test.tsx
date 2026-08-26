import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AUTH_CLAIMS } from "@/components/shared/auth-layout";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import VerifyEmailPage from "@/app/verify-email/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import InvitePage from "@/app/invite/page";
import ChangePasswordPage from "@/app/change-password/page";
import LoginOtpPage from "@/app/login/otp/page";
import LoginMfaPage from "@/app/login/mfa/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-client", () => ({
  post: vi.fn().mockResolvedValue({}),
  storeTokens: vi.fn(),
  join: vi.fn(),
  getRegistrationStatus: vi.fn().mockResolvedValue({
    org_creation_policy: "allow_all",
    approval_scope: "both",
  }),
  acceptInvite: vi.fn(),
  getInviteInfo: vi.fn().mockResolvedValue({ org_name: "Acme", email: "a@b.c", name: "A" }),
  ApiError: class ApiError extends Error {},
  changePassword: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => {
  localStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

/**
 * Every auth page must render through the shared AuthLayout — the brand panel
 * (gradient + OpenZync wordmark) used to be copy-pasted per page and the
 * marketing claims drifted ("3" vs "10+" Graph Backends).
 */
const AUTH_PAGES: Array<[string, React.ReactElement, string]> = [
  ["login", <LoginPage key="login" />, AUTH_CLAIMS.tagline],
  ["signup", <SignupPage key="signup" />, "Get started with agent memory infrastructure"],
  ["verify-email", <VerifyEmailPage key="verify" />, "Verify your email to continue"],
  ["forgot-password", <ForgotPasswordPage key="forgot" />, "Reset your password"],
  ["reset-password", <ResetPasswordPage key="reset" />, "Reset your password"],
  ["invite", <InvitePage key="invite" />, "Join your organization"],
  ["change-password", <ChangePasswordPage key="change" />, "Secure your account before continuing"],
  ["login/otp", <LoginOtpPage key="otp" />, AUTH_CLAIMS.tagline],
  ["login/mfa", <LoginMfaPage key="mfa" />, AUTH_CLAIMS.tagline],
];

describe("AuthLayout brand panel across all auth pages", () => {
  for (const [name, element, tagline] of AUTH_PAGES) {
    it(`${name} renders the shared brand panel`, () => {
      const { container } = render(element);
      // Brand wordmark (desktop panel + mobile block)
      expect(screen.getAllByText("OpenZync").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(tagline).length).toBeGreaterThanOrEqual(1);
      // Gradient shell from AuthLayout
      expect(container.querySelector(".bg-gradient-to-br")).not.toBeNull();
    });
  }

  it("stats pages render the shared claims, never the drifted ones", () => {
    for (const [, element] of AUTH_PAGES.filter(([n]) =>
      ["login", "login/otp", "login/mfa"].includes(n),
    )) {
      const { unmount } = render(element);
      for (const stat of AUTH_CLAIMS.stats) {
        expect(screen.getByText(stat.value)).toBeInTheDocument();
        expect(screen.getByText(stat.label)).toBeInTheDocument();
      }
      // The old contradictory claims must be gone everywhere.
      expect(screen.queryByText("10+")).toBeNull();
      expect(screen.queryByText("3")).toBeNull();
      unmount();
    }
  });

  it("features pages render the shared feature list", () => {
    for (const [, element] of AUTH_PAGES.filter(([n]) =>
      ["signup", "verify-email", "invite"].includes(n),
    )) {
      const { unmount } = render(element);
      expect(
        screen.getAllByText(AUTH_CLAIMS.features[0]).length,
      ).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });

  it("AUTH_CLAIMS is the single constants source with a truthful graph-backend claim", () => {
    // The backend supports postgres | surrealdb | none — no honest count ≥ 2
    // that includes the disabled state, so the claim must be count-free.
    expect(AUTH_CLAIMS.stats[0].label).toBe("Graph Backends");
    expect(AUTH_CLAIMS.stats[0].value).not.toMatch(/^\d/);
  });
});
