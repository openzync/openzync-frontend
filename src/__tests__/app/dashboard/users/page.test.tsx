import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsersPage from "@/app/(dashboard)/users/page";

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
    user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin" },
    role: "admin",
    isAdmin: true,
    loading: false,
  });
  mockUsersList([SELF, OTHER_ADMIN, MEMBER]);
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

  it("shows Make Admin only for a member row, not for admins or self", async () => {
    const user = userEvent.setup();
    renderAsAdmin();

    // Member row → Make admin (aria-label carries the external id).
    expect(
      await screen.findByLabelText("Make carol an admin"),
    ).toBeInTheDocument();

    // Another admin row → Remove admin, NOT Make admin.
    expect(
      screen.getByLabelText("Remove admin from bob"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Make bob an admin"),
    ).not.toBeInTheDocument();

    // Self row → no role toggle at all.
    expect(
      screen.queryByLabelText(/admin from self-admin/),
    ).not.toBeInTheDocument();
  });

  it("hides role buttons entirely for a member viewer", async () => {
    mockUseUser.mockReturnValue({
      user: { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: "member" },
      role: "member",
      isAdmin: false,
      loading: false,
    });
    mockUsersList([SELF, OTHER_ADMIN, MEMBER]);
    render(<UsersPage />);

    expect(await screen.findByText("Bob")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Make .* an admin/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove admin from/)).not.toBeInTheDocument();
    // Members do not see the create button either.
    expect(
      screen.queryByRole("button", { name: "Create User" }),
    ).not.toBeInTheDocument();
  });

  it("PATCHes the correct role when making a user an admin", async () => {
    const user = userEvent.setup();
    mockPatch.mockResolvedValue({ ...MEMBER, role: "admin" });
    renderAsAdmin();

    await user.click(await screen.findByLabelText("Make carol an admin"));
    // Confirm in the dialog.
    await user.click(
      screen.getByRole("button", { name: "Make Admin" }),
    );

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/v1/users/u-mem", {
        role: "admin",
      });
    });
  });

  it("PATCHes the correct role when removing admin", async () => {
    const user = userEvent.setup();
    mockPatch.mockResolvedValue({ ...OTHER_ADMIN, role: "member" });
    renderAsAdmin();

    await user.click(await screen.findByLabelText("Remove admin from bob"));
    // The confirm dialog carries the "Remove Admin" label.
    await user.click(
      screen.getByRole("button", { name: "Remove Admin" }),
    );

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/v1/users/u-admin", {
        role: "member",
      });
    });
  });

  // ── Invite flows ───────────────────────────────────────────────────────

  it("shows the Invite Member button to admins only", async () => {
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin" },
      role: "admin",
      isAdmin: true,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    const adminView = render(<UsersPage />);

    expect(
      await adminView.findByRole("button", { name: "Invite Member" }),
    ).toBeInTheDocument();
    adminView.unmount();

    // Member viewer does not see it.
    mockUseUser.mockReturnValue({
      user: { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: "member" },
      role: "member",
      isAdmin: false,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);
    expect(
      screen.queryByRole("button", { name: "Invite Member" }),
    ).not.toBeInTheDocument();
  });

  it("renders a Pending badge for pending invite rows only", async () => {
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin" },
      role: "admin",
      isAdmin: true,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);

    expect(await screen.findByText("Dave")).toBeInTheDocument();
    // Exactly one pending row → exactly one badge.
    expect(screen.getAllByText("Pending")).toHaveLength(1);
  });

  it("shows the Revoke action for pending rows to admins", async () => {
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin" },
      role: "admin",
      isAdmin: true,
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

  it("hides the Revoke action from member viewers", async () => {
    mockUseUser.mockReturnValue({
      user: { id: MEMBER.id, email: MEMBER.email, name: MEMBER.name, role: "member" },
      role: "member",
      isAdmin: false,
      loading: false,
    });
    mockUsersList([SELF, MEMBER, PENDING]);
    render(<UsersPage />);

    expect(await screen.findByText("Dave")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Revoke invite for/),
    ).not.toBeInTheDocument();
  });

  it("revokes the pending invite after confirmation", async () => {
    const user = userEvent.setup();
    mockRevokeInvite.mockResolvedValue({});
    mockUseUser.mockReturnValue({
      user: { id: SELF.id, email: SELF.email, name: SELF.name, role: "admin" },
      role: "admin",
      isAdmin: true,
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
});
