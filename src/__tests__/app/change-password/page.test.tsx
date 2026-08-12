import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePasswordPage from "@/app/change-password/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockChangePassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}));

beforeEach(() => {
  mockReplace.mockReset();
  mockChangePassword.mockReset();
  sessionStorage.clear();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("ChangePasswordPage", () => {
  it("renders the current + new password fields and strength meter", () => {
    render(<ChangePasswordPage />);

    expect(screen.getByPlaceholderText("Enter your current password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Minimum 8 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Password" })).toBeInTheDocument();
    expect(screen.getByText(/must be updated before you can continue/i)).toBeInTheDocument();
  });

  it("submits old + new password, stores the rotated tokens, redirects to /overview", async () => {
    const user = userEvent.setup();
    // The real changePassword helper stores the rotated pair (clear → store);
    // simulate that contract here so the page flow is exercised end to end.
    mockChangePassword.mockImplementation(async () => {
      sessionStorage.setItem("mg_access_token", "new-access");
      sessionStorage.setItem("mg_refresh_token", "new-refresh");
      return { access_token: "new-access", refresh_token: "new-refresh" };
    });

    render(<ChangePasswordPage />);
    await user.type(screen.getByPlaceholderText("Enter your current password"), "OldPass1!");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "NewPass1!");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith("OldPass1!", "NewPass1!");
    });
    expect(sessionStorage.getItem("mg_access_token")).toBe("new-access");
    expect(sessionStorage.getItem("mg_refresh_token")).toBe("new-refresh");
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });
  });

  it("shows the strength meter once the new password is typed", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    expect(screen.queryByText("Password strength")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "weak");
    expect(screen.getByText("Password strength")).toBeInTheDocument();
    expect(screen.getByText("Weak")).toBeInTheDocument();
  });

  it("renders the API error message and does not redirect on failure", async () => {
    const user = userEvent.setup();
    mockChangePassword.mockRejectedValue(new Error("Current password is incorrect"));

    render(<ChangePasswordPage />);
    await user.type(screen.getByPlaceholderText("Enter your current password"), "WrongPass1!");
    await user.type(screen.getByPlaceholderText("Minimum 8 characters"), "NewPass1!");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
