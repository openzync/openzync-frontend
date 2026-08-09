import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrgConfigIndexPage from "@/app/(dashboard)/settings/org-config/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseUser, mockGet, mockPost } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
    get isForbidden(): boolean {
      return this.status === 403;
    }
  }
  return {
    get: mockGet,
    post: mockPost,
    ApiError,
    apiErrorMessage: (err: unknown, fallback: string) =>
      err instanceof ApiError && err.isForbidden ? "Admin access required" : fallback,
  };
});

vi.mock("@/components/shared/error-state", () => ({
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    confirmLabel,
    onConfirm,
    loading,
  }: {
    open: boolean;
    confirmLabel: string;
    onConfirm: () => void;
    loading?: boolean;
  }) => (open ? <button onClick={onConfirm} disabled={loading}>{confirmLabel}</button> : null),
}));

const OLD_CODE = "K7M2Q9X4";
const NEW_CODE = "ZZZ2Q9X4";

function renderAsAdmin() {
  mockUseUser.mockReturnValue({
    user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin" },
    role: "admin",
    isAdmin: true,
    loading: false,
  });
  mockGet.mockResolvedValue({ org_code: OLD_CODE });
  return render(<OrgConfigIndexPage />);
}

describe("OrgConfigIndexPage (org code card)", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("renders the code fetched from GET /admin/org/org-code", async () => {
    renderAsAdmin();

    expect(await screen.findByText(OLD_CODE)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/admin/org/org-code");
  });

  it("regenerates via POST and shows the new code", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ org_code: NEW_CODE });
    renderAsAdmin();

    // Card button opens the confirm dialog.
    await user.click(await screen.findByRole("button", { name: "Regenerate" }));
    // The dialog's confirm button is the second "Regenerate" rendered.
    const confirmButtons = screen.getAllByRole("button", { name: "Regenerate" });
    expect(confirmButtons.length).toBe(2);
    await user.click(confirmButtons[1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/org/org-code/regenerate");
    });
    expect(await screen.findByText(NEW_CODE)).toBeInTheDocument();
    // The old code is gone from the card.
    expect(screen.queryByText(OLD_CODE)).not.toBeInTheDocument();
  });

  it("does not fetch the code for a non-admin", () => {
    mockUseUser.mockReturnValue({
      user: { id: "u2", email: "member@acme.com", name: "Member", role: "member" },
      role: "member",
      isAdmin: false,
      loading: false,
    });
    render(<OrgConfigIndexPage />);

    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("shows Admin access required when the role fetch failed (fail closed)", () => {
    // role: null — an unknown role must never reveal the code.
    mockUseUser.mockReturnValue({
      user: null,
      role: null,
      isAdmin: false,
      loading: false,
    });
    render(<OrgConfigIndexPage />);

    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("shows the error state with retry when the code fetch fails", async () => {
    mockUseUser.mockReturnValue({
      user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin" },
      role: "admin",
      isAdmin: true,
      loading: false,
    });
    mockGet.mockRejectedValue(new Error("Failed to load organization code"));
    render(<OrgConfigIndexPage />);

    expect(
      await screen.findByText("Failed to load organization code"),
    ).toBeInTheDocument();
  });
});
