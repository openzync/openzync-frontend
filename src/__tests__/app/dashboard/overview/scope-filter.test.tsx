import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { useEffect, useReducer } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OverviewPage from "@/app/(dashboard)/overview/page";
import { get, getAdminStats, ApiError } from "@/lib/api-client";
import type { AdminStatsParams } from "@/lib/api-client";

// Re-renders the page whenever the URL mock changes — the stand-in for
// Next.js re-rendering useSearchParams consumers after router.replace.
function OverviewPageHarness() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsub = onMockReplace(force);
    return () => {
      unsub();
    };
  }, []);
  return <OverviewPage />;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const { mockUseUser, mockReplace, setSearchParams, onMockReplace, searchParams } =
  vi.hoisted(() => {
    const params = new Map<string, string>();
    const listeners = new Set<() => void>();
    return {
      mockUseUser: vi.fn(),
      mockReplace: vi.fn((url: string) => {
        params.clear();
        for (const [k, v] of new URL(url, "http://x").searchParams) params.set(k, v);
        for (const notify of listeners) notify();
      }),
      setSearchParams: (entries: Record<string, string>) => {
        params.clear();
        for (const [k, v] of Object.entries(entries)) params.set(k, v);
      },
      onMockReplace: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      searchParams: () => new URLSearchParams([...params]),
    };
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/overview",
  useSearchParams: () => searchParams(),
  useParams: () => ({}),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

const PROJECTS = [
  { id: "p-1", name: "Customer Support Bot" },
  { id: "p-2", name: "Data Extraction Pipeline" },
];

const USERS = [
  { id: "u-1", name: "Alice" },
  { id: "u-2", external_id: "bob" },
];

const ORG_STATS = {
  total_episodes: 25,
  total_sessions: 100,
  total_facts: 200,
  total_extractions: 40,
  total_observations: 12,
  total_classifications: 7,
};

const baseGetImpl = (path: string) => {
  if (path === "/v1/users") {
    return Promise.resolve({ data: USERS });
  }
  if (path === "/v1/projects?limit=100") {
    return Promise.resolve({ data: PROJECTS });
  }
  if (path.startsWith("/v1/admin/stats/usage")) {
    return Promise.resolve({ data: [] });
  }
  if (path.startsWith("/v1/admin/stats")) {
    return Promise.resolve(ORG_STATS);
  }
  if (path === "/v1/admin/quick-actions") {
    return Promise.resolve({ actions: [] });
  }
  return Promise.resolve({});
};

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  const getMock = vi.fn().mockImplementation((path: string) => baseGetImpl(path));
  return {
    ...actual,
    get: getMock,
    getAdminStats: vi.fn().mockImplementation(
      ((params: AdminStatsParams = {}) => {
        const query = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) query.set(k, String(v));
        const suffix = query.size ? `?${query}` : "";
        return baseGetImpl(`/v1/admin/stats${suffix}`);
      }) as typeof getAdminStats,
    ),
  };
});

vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock("@/components/shared/stat-card", () => ({
  StatCard: ({ label, value }: { label: string; value: number | null }) => (
    <div data-testid="stat-card">
      <span>{label}</span>
      <span>{value !== null ? value : "—"}</span>
    </div>
  ),
}));

vi.mock("@/components/shared/charts", () => ({
  BarChart: () => <div data-testid="bar-chart" />,
  cssVar: (name: string) => `var(${name})`,
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideDashboard: () => <div>Guide Icon</div>,
}));

function holderMock() {
  return {
    user: { id: "u1", role: "admin" as const, permissions: [] as string[] },
    role: "admin" as const,
    permissions: [] as string[],
    isAdmin: true,
    can: () => true,
    mustChangePassword: false,
    loading: false,
  };
}

function memberMock() {
  return {
    user: {
      id: "u9",
      role: "member" as const,
      permissions: ["project:read"],
    },
    role: "member" as const,
    permissions: ["project:read"],
    isAdmin: false,
    can: () => false,
    mustChangePassword: false,
    loading: false,
  };
}

function statsCalls(): string[] {
  return vi
    .mocked(getAdminStats)
    .mock.calls.map(([params]) => {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries((params ?? {}) as Record<string, unknown>)) {
        if (v !== undefined) query.set(k, String(v));
      }
      return query.toString();
    });
}

// jsdom lacks the PointerEvent APIs Radix Popover (SimpleSelect) relies on.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockClear();
  mockUseUser.mockReset();
  setSearchParams({});
  vi.mocked(get).mockImplementation((path: string) => baseGetImpl(path));
  vi.mocked(getAdminStats).mockImplementation(
    ((params: AdminStatsParams = {}) => {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) query.set(k, String(v));
      const suffix = query.size ? `?${query}` : "";
      return baseGetImpl(`/v1/admin/stats${suffix}`);
    }) as typeof getAdminStats,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("OverviewPage platform scope filter", () => {
  it("holder sees the User dropdown; plain member does not", async () => {
    mockUseUser.mockReturnValue(holderMock());
    const { unmount } = render(<OverviewPage />);
    expect(
      await screen.findByRole("combobox", { name: "Filter by user" }),
    ).toBeInTheDocument();
    unmount();

    mockUseUser.mockReturnValue(memberMock());
    render(<OverviewPage />);
    await screen.findByText("Overview");
    expect(
      screen.queryByRole("combobox", { name: "Filter by user" }),
    ).not.toBeInTheDocument();
  });

  it("scope visibility: holder sees User and project dropdowns, member sees project dropdown only", async () => {
    mockUseUser.mockReturnValue(holderMock());
    const { unmount } = render(<OverviewPage />);
    expect(
      await screen.findByRole("combobox", { name: "Filter by user" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by project" }),
    ).toBeInTheDocument();
    unmount();

    mockUseUser.mockReturnValue(memberMock());
    render(<OverviewPage />);
    await screen.findByText("Overview");
    expect(
      screen.queryByRole("combobox", { name: "Filter by user" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by project" }),
    ).toBeInTheDocument();
  });

  it("?user_id= drives the API scope", async () => {
    mockUseUser.mockReturnValue(holderMock());
    setSearchParams({ user_id: "u-9" });
    render(<OverviewPageHarness />);
    await screen.findByRole("combobox", { name: "Filter by user" });
    await vi.waitFor(() => {
      expect(statsCalls().some((q) => q.includes("user_id=u-9"))).toBe(true);
    });
  });

  it("?project= maps to project_id on stats and usage fetches (pin)", async () => {
    mockUseUser.mockReturnValue(holderMock());
    setSearchParams({ project: "p-1" });
    render(<OverviewPageHarness />);
    // Project dropdown reflects the selection; scope assertion is on the fetches.
    await screen.findByRole("combobox", { name: "Filter by project" });
    await vi.waitFor(() => {
      expect(statsCalls().some((q) => q.includes("project_id=p-1"))).toBe(true);
    });
    await vi.waitFor(() => {
      expect(
        vi
          .mocked(get)
          .mock.calls.some(
            ([p]) =>
              String(p).startsWith("/v1/admin/stats/usage") &&
              String(p).includes("project_id=p-1"),
          ),
      ).toBe(true);
    });
  });

  it("either-or: a user selection clears the project and disables its dropdown", async () => {
    mockUseUser.mockReturnValue(holderMock());
    const user = userEvent.setup();
    setSearchParams({ project: "p-1" });
    render(<OverviewPageHarness />);
    const userCombo = await screen.findByRole("combobox", { name: "Filter by user" });
    const projectCombo = screen.getByRole("combobox", { name: "Filter by project" });
    // A project selection disables the user filter.
    expect(userCombo).toBeDisabled();

    await user.click(projectCombo);
    await user.click(await screen.findByRole("option", { name: "All projects" }));
    const userComboEnabled = await screen.findByRole("combobox", { name: "Filter by user" });
    expect(userComboEnabled).not.toBeDisabled();

    // Selecting a user writes ?user_id= and drops ?project=.
    await user.click(userComboEnabled);
    await user.click(await screen.findByRole("option", { name: "Alice" }));
    expect(mockReplace).toHaveBeenCalledWith("/overview?user_id=u-1", {
      scroll: false,
    });
  });

  it("dropdown 403 is fail-soft: page renders, user filter hidden", async () => {
    mockUseUser.mockReturnValue(holderMock());
    vi.mocked(get).mockImplementation((path: string) => {
      if (path === "/v1/users") {
        return Promise.reject(new ApiError("Forbidden", 403, {}));
      }
      return baseGetImpl(path);
    });
    render(<OverviewPage />);
    // The page keeps its own data — no crash, no user filter.
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(
        screen.queryByRole("combobox", { name: "Filter by user" }),
      ).not.toBeInTheDocument();
    });
  });
});
