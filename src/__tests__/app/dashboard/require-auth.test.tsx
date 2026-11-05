import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RequireAuth } from "@/app/(dashboard)/require-auth";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const {
  mockRefreshOnce,
  mockReplace,
  mockGet,
  mockClearTokens,
  mockHasRefreshCredential,
} = vi.hoisted(() => ({
  mockRefreshOnce: vi.fn(),
  mockReplace: vi.fn(),
  mockGet: vi.fn(),
  mockClearTokens: vi.fn(),
  mockHasRefreshCredential: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
}));

// getAccessToken() → null IS the reload state: the access token is memory-only,
// so it is absent on every fresh page load while the refresh token persists.
// clearTokens must delete that persisted token like the real one does, otherwise
// "the token survived" would pass even when the gate logged the user out.
vi.mock("@/lib/api-client", () => ({
  AUTH_REDIRECT_EVENT: "openzync:auth-redirect",
  refreshOnce: mockRefreshOnce,
  getAccessToken: () => null,
  get: mockGet,
  clearTokens: () => {
    mockClearTokens();
    localStorage.removeItem("mg_refresh_token");
  },
  hasRefreshCredential: mockHasRefreshCredential,
}));

describe("RequireAuth on a fresh page load", () => {
  beforeEach(() => {
    mockRefreshOnce.mockReset();
    mockReplace.mockReset();
    mockGet.mockReset();
    mockClearTokens.mockReset();
    mockHasRefreshCredential.mockReset();
    // Default: a refresh credential exists, so a transport failure lands on retry.
    mockHasRefreshCredential.mockReturnValue(true);
    localStorage.clear();
  });

  it("refreshes with the persisted token instead of logging out", async () => {
    localStorage.setItem("mg_refresh_token", "r");
    mockRefreshOnce.mockResolvedValue("new-access");
    // Minimal /v1/auth/me payload so the wrapped UserProvider resolves.
    mockGet.mockResolvedValue({ id: "u1", email: "user@acme.com", role: "member" });

    render(
      <RequireAuth>
        <div>shell</div>
      </RequireAuth>,
    );

    await waitFor(() => expect(mockRefreshOnce).toHaveBeenCalledTimes(1));
    await screen.findByText("shell");

    // No logout redirect, and the only credential that survives a reload is intact.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(localStorage.getItem("mg_refresh_token")).toBe("r");
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it("sends an anonymous visitor to login when no refresh credential exists", async () => {
    mockRefreshOnce.mockRejectedValue(new Error("boom"));
    mockHasRefreshCredential.mockReturnValue(false);

    render(
      <RequireAuth>
        <div>shell</div>
      </RequireAuth>,
    );

    // No credential → no retry can succeed, so straight to login.
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/login?reason=not-signed-in"),
    );
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryByText("shell")).toBeNull();
    // Nothing to clear — the guard must not log a session out on the way.
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it("shows the retry screen when a refresh credential survives the failure", async () => {
    mockRefreshOnce.mockRejectedValue(new Error("boom"));
    mockHasRefreshCredential.mockReturnValue(true);

    render(
      <RequireAuth>
        <div>shell</div>
      </RequireAuth>,
    );

    await screen.findByRole("button", { name: /retry/i });
    expect(screen.getByText(/Could not refresh your session/)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("shell")).toBeNull();
  });
});
