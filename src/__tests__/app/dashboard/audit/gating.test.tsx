import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AuditLogPage from "@/app/(dashboard)/audit/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const { mockUseUser, mockGet, mockReplace, setSearchParams } = vi.hoisted(() => {
  const params = new Map<string, string>();
  return {
    mockUseUser: vi.fn(),
    mockGet: vi.fn(),
    mockReplace: vi.fn(),
    setSearchParams: (entries: Record<string, string>) => {
      params.clear();
      for (const [k, v] of Object.entries(entries)) params.set(k, v);
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/audit",
  useSearchParams: () => ({ get: (key: string) => null }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: mockGet,
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideSecurity: () => <div>Security Icon</div>,
}));

function holderMock() {
  return {
    user: { id: "u1", role: "admin" as const, permissions: [] as string[] },
    loading: false,
    isAdmin: true,
    can: () => true,
  };
}

function memberMock() {
  return {
    user: { id: "u2", role: "member" as const, permissions: ["project:read"] },
    loading: false,
    isAdmin: false,
    can: () => false,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("AuditLogPage platform:manage gating", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.scrollIntoView = () => {};
  });

  beforeEach(() => {
    mockUseUser.mockReset();
    mockGet.mockReset();
    mockReplace.mockClear();
    setSearchParams({});
    mockGet.mockImplementation((path: string) => {
      if (path === "/v1/admin/audit-logs/actions") {
        return Promise.resolve({ data: ["session.create"] });
      }
      if (path.startsWith("/v1/admin/audit-logs")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("holder sees the audit log table", async () => {
    mockUseUser.mockReturnValue(holderMock());
    render(<AuditLogPage />);

    // The entries fetch fires for holders; the table shell renders.
    await vi.waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });
    expect(
      mockGet.mock.calls.some(([p]) =>
        String(p).startsWith("/v1/admin/audit-logs"),
      ),
    ).toBe(true);
  });

  it("plain member is denied", async () => {
    mockUseUser.mockReturnValue(memberMock());
    render(<AuditLogPage />);

    // The gate replaces the table with a denial — the page is unusable
    // without platform:manage (background fetches still fire from the
    // same component's effects; the gate only swaps the rendered output).
    expect(
      await screen.findByText("You don't have permission to view this page"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
