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
// admin-only labels appear twice for admins and zero times for members.
const ADMIN_ONLY_LABELS = ["Users", "Monitoring", "Audit Log", "Configuration", "Extraction Schemas", "Webhooks", "Extraction Instructions", "Prompt Templates"];

describe("DashboardLayout nav gating", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    // Default: an org admin whose role is fully resolved.
    mockUseUser.mockReturnValue({
      user: { id: "u1", email: "admin@acme.com", name: "Admin", role: "admin" },
      role: "admin",
      isAdmin: true,
      loading: false,
    });
  });

  it("renders page content", () => {
    renderLayout();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("shows admin-only nav items for an org admin", () => {
    renderLayout();

    for (const label of ADMIN_ONLY_LABELS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("hides admin-only nav items for an org member", () => {
    mockUseUser.mockReturnValue({
      user: { id: "u2", email: "member@acme.com", name: "Member", role: "member" },
      role: "member",
      isAdmin: false,
      loading: false,
    });

    renderLayout();

    for (const label of ADMIN_ONLY_LABELS) {
      expect(screen.queryAllByText(label).length).toBe(0);
    }
  });

  it("treats an unresolved role (null) as a member — fail closed", () => {
    mockUseUser.mockReturnValue({
      user: null,
      role: null,
      isAdmin: false,
      loading: false,
    });

    renderLayout();

    for (const label of ADMIN_ONLY_LABELS) {
      expect(screen.queryAllByText(label).length).toBe(0);
    }
    // Non-admin nav stays available to everyone.
    expect(screen.getAllByText("Account Settings").length).toBeGreaterThan(0);
  });

  it("keeps shared (non-admin) navigation for members", () => {
    mockUseUser.mockReturnValue({
      user: { id: "u2", email: "member@acme.com", name: "Member", role: "member" },
      role: "member",
      isAdmin: false,
      loading: false,
    });

    renderLayout();

    for (const label of ["Overview", "View all projects", "Account Settings"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});
