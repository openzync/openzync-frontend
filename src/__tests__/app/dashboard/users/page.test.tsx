import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsersPage from "@/app/(dashboard)/users/page";
import { ApiError } from "@/lib/api-client";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseUser, mockGet, mockPatch, mockPost, mockDel, mockInviteUser, mockRevokeInvite } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
  mockDel: vi.fn(),
  mockInviteUser: vi.fn(),
  mockRevokeInvite: vi.fn(),
}));

// Sort state is URL-synced through useSortQuery, which reads the query string
// and rewrites it on header clicks.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/users",
  useSearchParams: () => new URLSearchParams(),
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
    patch: mockPatch,
    post: mockPost,
    del: mockDel,
    inviteUser: mockInviteUser,
    revokeInvite: mockRevokeInvite,
    ApiError,
    apiErrorMessage: (err: unknown, fallback: string) =>
      err instanceof ApiError && err.isForbidden ? "Admin access required" : fallback,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils", () => ({
  formatDate: () => "Jun 1, 2025",
  timeAgo: () => "now",
  copyToClipboard: vi.fn().mockResolvedValue(true),
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// Lightweight stand-ins for the heavy presentational components.
vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  GuideSecurity: () => null,
}));

vi.mock("@/components/shared/error-state", () => ({
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: () => <div>empty</div>,
}));

vi.mock("@/components/shared/skeleton", () => ({
  TableSkeleton: () => null,
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

const SELF = {
  id: "u-self",
  external_id: "self-admin",
  name: "Self Admin",
  email: "self@acme.com",
  role: "admin",
  is_active: true,
  created_at: "2025-06-01T00:00:00Z",
};

const OTHER_ADMIN = {
  id: "u-admin",
  external_id: "bob",
  name: "Bob",
  email: "bob@acme.com",
  role: "admin",
  is_active: true,
  created_at: "2025-06-01T00:00:00Z",
};

const MEMBER = {
  id: "u-mem",
  external_id: "carol",
  name: "Carol",
  email: "carol@acme.com",
  role: "member",
  is_active: true,
  created_at: "2025-06-01T00:00:00Z",
};

const PENDING = {
  id: "u-pending",
  external_id: "dave",
  name: "Dave",
  email: "dave@acme.com",
  role: "member",
  is_active: true,
  is_pending_invite: true,
  created_at: "2025-06-02T00:00:00Z",
};

function mockUsersList(users: typeof SELF[]) {
  mockGet.mockResolvedValue({
    data: users,
    next_cursor: null,
    has_more: false,
  });
}

function renderAsAdmin() {
  mockUseUser.mockReturnValue({
    user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin", permissions: [] },
    role: "admin",
    isAdmin: true,
    can: () => true,
    loading: false,
  });
  mockUsersList([SELF, OTHER_ADMIN, MEMBER]);
  return render(<UsersPage />);
}

/** Viewer without admin (page gate blocks) — no list renders at all. */
function renderAsReadOnlyMember(users: typeof SELF[] = [SELF, OTHER_ADMIN, MEMBER]) {
  mockUseUser.mockReturnValue({
    user: { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: "member", permissions: ["members:read"] },
    role: "member",
    isAdmin: false,
    can: (p: string) => p === "members:read",
    loading: false,
  });
  mockUsersList(users);
  return render(<UsersPage />);
}

describe("UsersPage", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPatch.mockReset();
    mockPost.mockReset();
    mockDel.mockReset();
    mockInviteUser.mockReset();
    mockRevokeInvite.mockReset();
  });

  it("renders role badges for admin and member users", async () => {
    renderAsAdmin();

    expect(await screen.findByText("Bob")).toBeInTheDocument();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Member").length).toBeGreaterThan(0);
  });

  it("shows View + Delete actions per row and no role toggles", async () => {
    renderAsAdmin();

    // Every row exposes View (title) and Delete (aria-label with external id).
    expect(await screen.findByLabelText("Delete carol")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete bob")).toBeInTheDocument();
    expect(screen.getAllByTitle("View User")).toHaveLength(3);

    // Role changes are frozen — no role toggle, no edit, no copy affordances.
    expect(screen.queryByLabelText(/Make .* an admin/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove admin from/)).not.toBeInTheDocument();
    expect(screen.queryByTitle("Edit User")).not.toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("hides the list entirely for a non-admin viewer", async () => {
    renderAsReadOnlyMember();

    // Admin-only page gate — no list, no actions, no fetch.
    expect(
      await screen.findByText("Admin access required"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Delete /)).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("shows the admin gate and fetches nothing without the role", async () => {
    mockUseUser.mockReturnValue({
      user: { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: "member", permissions: ["project:read", "project:write"] },
      role: "member",
      isAdmin: false,
      can: () => false,
      loading: false,
    });
    render(<UsersPage />);

    expect(
      await screen.findByText("Admin access required"),
    ).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("deletes a user after confirmation via DELETE (no role PATCH)", async () => {
    const user = userEvent.setup();
    mockDel.mockResolvedValue({});
    renderAsAdmin();

    await user.click(await screen.findByLabelText("Delete carol"));
    // Confirm in the dialog.
    await user.click(
      screen.getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/v1/users/u-mem");
    });
    // Role changes are frozen — the page never PATCHes a role.
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("exposes View links for every row, including self", async () => {
    renderAsAdmin();

    const viewButtons = await screen.findAllByTitle("View User");
    expect(viewButtons).toHaveLength(3);
    // Self row is marked and still viewable; deletion is backend-guarded.
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.queryByTitle("Edit User")).not.toBeInTheDocument();
  });

  // ── Invite flows ───────────────────────────────────────────────────────

  it("shows the Invite Member and Create User buttons to admins only", async () => {
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin", permissions: [] },
      role: "admin",
      isAdmin: true,
      can: () => true,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    const adminView = render(<UsersPage />);

    expect(
      await adminView.findByRole("button", { name: "Invite Member" }),
    ).toBeInTheDocument();
    expect(
      adminView.getByRole("button", { name: "Create User" }),
    ).toBeInTheDocument();
    adminView.unmount();

    // Non-admin viewer hits the page gate — no list, no invite button.
    mockUseUser.mockReturnValue({
      user: { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: "member", permissions: ["members:read"] },
      role: "member",
      isAdmin: false,
      can: (p: string) => p === "members:read",
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);
    expect(
      await screen.findByText("Admin access required"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invite Member" }),
    ).not.toBeInTheDocument();
  });

  it("renders a Pending badge for pending invite rows only", async () => {
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin", permissions: [] },
      role: "admin",
      isAdmin: true,
      can: () => true,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);

    expect(await screen.findByText("Dave")).toBeInTheDocument();
    // Exactly one pending row → exactly one badge.
    expect(screen.getAllByText("Pending")).toHaveLength(1);
  });

  it("shows the Revoke action for pending rows to members:write holders", async () => {
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin", permissions: [] },
      role: "admin",
      isAdmin: true,
      can: () => true,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);

    expect(
      await screen.findByLabelText("Revoke invite for dave"),
    ).toBeInTheDocument();
    // Non-pending rows keep Delete, not Revoke.
    expect(
      screen.queryByLabelText(/Revoke invite for carol/),
    ).not.toBeInTheDocument();
  });

  it("hides the list and header actions from read-only member viewers (admin gate)", async () => {
    renderAsReadOnlyMember([SELF, MEMBER, PENDING]);

    expect(
      await screen.findByText("Admin access required"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dave")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invite Member" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create User" }),
    ).not.toBeInTheDocument();
  });

  it("revokes the pending invite after confirmation", async () => {
    const user = userEvent.setup();
    mockRevokeInvite.mockResolvedValue({});
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin", permissions: [] },
      role: "admin",
      isAdmin: true,
      can: () => true,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);

    await user.click(await screen.findByLabelText("Revoke invite for dave"));
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(mockRevokeInvite).toHaveBeenCalledWith("u-pending");
    });
  });

  it("submits the Invite Member dialog with trimmed email and name, then closes", async () => {
    const user = userEvent.setup();
    mockInviteUser.mockResolvedValue({});
    renderAsAdmin();

    await user.click(
      await screen.findByRole("button", { name: "Invite Member" }),
    );
    await user.type(
      screen.getByPlaceholderText("e.g. jane@acme.com"),
      "  jane@acme.com  ",
    );
    await user.type(
      screen.getByPlaceholderText("e.g. Jane Doe"),
      "  Jane Doe  ",
    );
    await user.click(screen.getByRole("button", { name: "Send Invite" }));

    // The dialog trims before submitting — the call must carry trimmed values.
    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalledWith("jane@acme.com", "Jane Doe");
    });

    // Success closes the dialog (the "Send Invite" button only lives inside it).
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Send Invite" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the dialog open and shows the server detail on a 409", async () => {
    const user = userEvent.setup();
    mockInviteUser.mockRejectedValue(
      new ApiError("Invite already pending for this email", 409, null),
    );
    renderAsAdmin();

    await user.click(
      await screen.findByRole("button", { name: "Invite Member" }),
    );
    await user.type(
      screen.getByPlaceholderText("e.g. jane@acme.com"),
      "jane@acme.com",
    );
    await user.type(
      screen.getByPlaceholderText("e.g. Jane Doe"),
      "Jane Doe",
    );
    await user.click(screen.getByRole("button", { name: "Send Invite" }));

    // The page renders err.message inside the dialog — no toast-only fallback.
    expect(
      await screen.findByText("Invite already pending for this email"),
    ).toBeInTheDocument();
    expect(mockInviteUser).toHaveBeenCalledTimes(1);
    // Dialog stays open so the admin can fix the input and retry.
    expect(
      screen.getByRole("button", { name: "Send Invite" }),
    ).toBeInTheDocument();
  });
});
