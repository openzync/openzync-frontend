import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardLayout from "@/app/(dashboard)/layout";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseUser } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/hooks/use-pinned-projects", () => ({
  usePinnedProjects: () => ({ pinned: [] }),
}));

vi.mock("@/lib/api-client", () => ({
  get: vi.fn(),
  getAccessToken: () => null,
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
const CONFIG_READ_LABELS = ["Configuration", "Extraction Schemas", "Webhooks", "Extraction Instructions", "Prompt Templates"];
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
    // Default: an org admin whose role is fully resolved.
    mockUseUser.mockReturnValue(adminMock());
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
    // Non-admin nav stays available to everyone. ("Account Settings" is not
    // sidebar nav — it only exists as a breadcrumb label for /settings paths.)
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
