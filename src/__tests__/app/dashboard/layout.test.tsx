import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardLayout from "@/app/(dashboard)/layout";
import { useConfigDirty } from "@/contexts/config-dirty";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseUser, mockPush, mockGet } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockPush: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/hooks/use-pinned-projects", () => ({
  usePinnedProjects: () => ({ pinned: [] }),
}));

vi.mock("@/lib/api-client", () => ({
  get: mockGet,
  getAccessToken: () => null,
  clearTokens: vi.fn(),
}));

// The sidebar reads the JWT subject before fetching the profile label.
vi.mock("@/lib/jwt", () => ({
  getJwtPayload: () => ({ sub: "user-1" }),
}));

vi.mock("@/app/(dashboard)/require-auth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/breadcrumb", () => ({
  Breadcrumb: () => null,
}));

vi.mock("@/components/shared/command-palette", () => ({
  CommandPalette: () => null,
}));

vi.mock("@/components/shared/app-version", () => ({
  AppVersion: () => null,
}));

function renderLayout() {
  return render(
    <DashboardLayout>
      <div>page content</div>
    </DashboardLayout>,
  );
}

// The sidebar renders twice (mobile + desktop, CSS-hidden in jsdom), so
// visible labels appear twice for who can see them and zero times otherwise.
const CONFIG_READ_LABELS = ["Configuration", "Extraction Schemas", "Classifications", "Extractions", "Webhooks", "Extraction Instructions", "Prompt Templates"];
const MEMBERS_READ_LABELS = ["Users", "Monitoring", "Audit Log"];
const ADMIN_ONLY_LABELS = [...MEMBERS_READ_LABELS, ...CONFIG_READ_LABELS];

function adminMock() {
  return {
    user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin", permissions: [] },
    role: "admin",
    isAdmin: true,
    isSuperadmin: false,
    can: () => true,
    loading: false,
  };
}

function memberMock(permissions: string[]) {
  return {
    user: { id: "u2", email: "member@acme.com", name: "Member", role: "member", permissions },
    role: "member",
    isAdmin: false,
    isSuperadmin: false,
    // Wildcard applies to admins only — members match against the list.
    can: (p: string) => permissions.includes(p),
    loading: false,
  };
}

describe("DashboardLayout nav gating", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPush.mockReset();
    // Default: an org admin whose role is fully resolved.
    mockUseUser.mockReturnValue(adminMock());
    // The sidebar fetches the profile label on mount (JWT subject resolves).
    mockGet.mockResolvedValue({ email: "admin@acme.com" });
  });

  it("renders page content", () => {
    renderLayout();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("shows admin-only nav items for an org admin (wildcard)", () => {
    renderLayout();

    for (const label of ADMIN_ONLY_LABELS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("hides admin-only nav items for a member with only member defaults", () => {
    // Member defaults are {project:read, project:write} — no org-admin surface.
    mockUseUser.mockReturnValue(memberMock(["project:read", "project:write"]));

    renderLayout();

    for (const label of ADMIN_ONLY_LABELS) {
      expect(screen.queryAllByText(label).length).toBe(0);
    }
  });

  it("shows configuration surfaces for a member granted configuration:read", () => {
    mockUseUser.mockReturnValue(memberMock(["configuration:read"]));

    renderLayout();

    for (const label of CONFIG_READ_LABELS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // But no members:read surfaces (Users/Monitoring/Audit Log).
    for (const label of MEMBERS_READ_LABELS) {
      expect(screen.queryAllByText(label).length).toBe(0);
    }
  });

  it("treats an unresolved role (null) as a member — fail closed", () => {
    mockUseUser.mockReturnValue({
      user: null,
      role: null,
      isAdmin: false,
      isSuperadmin: false,
      can: () => false,
      loading: false,
    });

    renderLayout();

    for (const label of ADMIN_ONLY_LABELS) {
      expect(screen.queryAllByText(label).length).toBe(0);
    }
    // Non-admin nav stays available to everyone. ("Account" is not sidebar
    // nav — it only exists in the user menu and as a breadcrumb label for
    // /account paths.)
    for (const label of ["Overview", "Search"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("keeps shared (non-admin) navigation for members", () => {
    mockUseUser.mockReturnValue(memberMock(["project:read", "project:write"]));

    renderLayout();

    // Shared nav = items that render for every role (Insights + bottom bar).
    for (const label of ["Overview", "View all projects", "Search"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});

describe("DashboardLayout unsaved-changes guard (SidebarLink)", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPush.mockReset();
    mockUseUser.mockReturnValue(adminMock());
    mockGet.mockResolvedValue({ email: "admin@acme.com" });
  });

  it("intercepts a dirty sidebar click with the confirm dialog; Leave navigates and clears", async () => {
    const user = userEvent.setup();
    let markDirty: (() => void) | null = null;
    function DirtyProbe() {
      const { setDirty } = useConfigDirty();
      markDirty = () => setDirty(true);
      return null;
    }
    render(
      <DashboardLayout>
        <DirtyProbe />
        <div>page content</div>
      </DashboardLayout>,
    );

    await screen.findAllByText("admin@acme.com");
    markDirty!();

    // Sidebar renders twice (mobile + desktop); click the first Overview link.
    const overviewLinks = screen.getAllByRole("link", { name: "Overview" });
    await user.click(overviewLinks[0]);

    // Intercepted — dialog opens, no navigation yet.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    // Leave clears the dirty flag, then routes.
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(mockPush).toHaveBeenCalledWith("/overview");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    // Guard is disarmed after leaving — a second click passes straight through
    // (no dialog re-opens from the stale dirty flag).
    const links = screen.getAllByRole("link", { name: "Overview" });
    await user.click(links[0]);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows no confirm dialog when navigating while clean", async () => {
    const user = userEvent.setup();
    renderLayout();

    await screen.findAllByText("admin@acme.com");
    const links = screen.getAllByRole("link", { name: "Overview" });
    await user.click(links[0]).catch(() => {
      // Clean clicks fall through to Next Link's own router; without an app
      // router context that may warn — the contract under test is only that
      // the guard stays silent.
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("DashboardLayout user menu (DropdownMenu)", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockPush.mockReset();
    mockUseUser.mockReturnValue(adminMock());
    // Sidebar profile fetch resolves to the user's email.
    mockGet.mockResolvedValue({ email: "admin@acme.com" });
  });

  /** The sidebar renders twice (mobile + desktop); both triggers share the label. */
  function openUserMenu(user: ReturnType<typeof userEvent.setup>) {
    const triggers = screen.getAllByRole("button", { name: /admin@acme\.com/i });
    return user.click(triggers[0]);
  }

  it("opens a menu with the email header, Account, and Sign Out items", async () => {
    const user = userEvent.setup();
    renderLayout();

    // Menu trigger label appears once the profile fetch resolves.
    await screen.findAllByText("admin@acme.com");
    await openUserMenu(user);

    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("admin@acme.com")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /account/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("Sign Out clears tokens and routes to /login", async () => {
    const user = userEvent.setup();
    const { clearTokens } = await import("@/lib/api-client");
    renderLayout();

    await screen.findAllByText("admin@acme.com");
    await openUserMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(clearTokens).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
