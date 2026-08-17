import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrgConfigIndexPage from "@/app/(dashboard)/settings/org-config/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseUser, mockGet, mockPost, mockPatch } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
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
    patch: mockPatch,
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
    user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin", permissions: [] },
    role: "admin",
    isAdmin: true,
    can: () => true,
    loading: false,
  });
  mockGet.mockResolvedValue({ org_code: OLD_CODE, join_enabled: true });
  return render(<OrgConfigIndexPage />);
}

function renderAsMember(permissions: string[]) {
  mockUseUser.mockReturnValue({
    user: { id: "u2", email: "member@acme.com", name: "Member", role: "member", permissions },
    role: "member",
    isAdmin: false,
    can: (p: string) => permissions.includes(p),
    loading: false,
  });
  return render(<OrgConfigIndexPage />);
}

describe("OrgConfigIndexPage (org code card)", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
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

  it("does not fetch the code without configuration:read", () => {
    renderAsMember(["project:read", "project:write"]);

    expect(
      screen.getByText("This action requires the 'configuration:read' permission."),
    ).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("shows the permission error when the role fetch failed (fail closed)", () => {
    // role: null — an unknown role must never reveal the code.
    mockUseUser.mockReturnValue({
      user: null,
      role: null,
      isAdmin: false,
      can: () => false,
      loading: false,
    });
    render(<OrgConfigIndexPage />);

    expect(
      screen.getByText("This action requires the 'configuration:read' permission."),
    ).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("shows the code but hides write actions with configuration:read only", async () => {
    // configuration:read unlocks the page; configuration:write gates mutations.
    mockGet.mockResolvedValue({ org_code: OLD_CODE, join_enabled: true });
    renderAsMember(["configuration:read"]);

    expect(await screen.findByText(OLD_CODE)).toBeInTheDocument();
    // Regenerate is a write — hidden.
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    // The join switch is a write — disabled with an explanatory hint.
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(
      screen.getByText(/configuration:write/),
    ).toBeInTheDocument();
  });

  it("shows the error state with retry when the code fetch fails", async () => {
    mockUseUser.mockReturnValue({
      user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin", permissions: [] },
      role: "admin",
      isAdmin: true,
      can: () => true,
      loading: false,
    });
    mockGet.mockRejectedValue(new Error("Failed to load organization code"));
    render(<OrgConfigIndexPage />);

    expect(
      await screen.findByText("Failed to load organization code"),
    ).toBeInTheDocument();
  });

  it("disables joining via PATCH and shows the paused banner", async () => {
    const user = userEvent.setup();
    mockPatch.mockResolvedValue({ org_code: OLD_CODE, join_enabled: false });
    renderAsAdmin();

    // Switch renders only after the GET resolves (join_enabled: true).
    await user.click(await screen.findByRole("switch"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/org/org-code", {
        join_enabled: false,
      });
    });
    expect(await screen.findByText(/Joining is paused/)).toBeInTheDocument();
    // The org-code card stays intact — code still visible alongside the banner.
    expect(screen.getByText(OLD_CODE)).toBeInTheDocument();
  });

  it("disables the switch while the PATCH is in flight, re-enables after", async () => {
    const user = userEvent.setup();
    let resolvePatch!: (v: { org_code: string; join_enabled: boolean }) => void;
    mockPatch.mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve;
      }),
    );
    renderAsAdmin();

    await user.click(await screen.findByRole("switch"));

    // PATCH pending → switch disabled (no double-toggle, no state flash).
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
    expect(mockPatch).toHaveBeenCalledWith("/admin/org/org-code", {
      join_enabled: false,
    });

    // Response lands → paused banner shows, switch is interactive again.
    resolvePatch({ org_code: OLD_CODE, join_enabled: false });
    expect(await screen.findByText(/Joining is paused/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeDisabled();
  });

  it("shows the paused banner on load when joining is disabled", async () => {
    mockUseUser.mockReturnValue({
      user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin", permissions: [] },
      role: "admin",
      isAdmin: true,
      can: () => true,
      loading: false,
    });
    mockGet.mockResolvedValue({ org_code: OLD_CODE, join_enabled: false });
    render(<OrgConfigIndexPage />);

    expect(await screen.findByText(/Joining is paused/)).toBeInTheDocument();
    expect(screen.getByText(OLD_CODE)).toBeInTheDocument();
  });
});
