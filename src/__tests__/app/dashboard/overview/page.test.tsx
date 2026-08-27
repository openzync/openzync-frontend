import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect, useReducer } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OverviewPage from "@/app/(dashboard)/overview/page";
import { get } from "@/lib/api-client";

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
// Stateful URL simulation: router.replace writes ?days= back into the
// search-param mock and notifies subscribers, mirroring how real Next.js
// re-renders useSearchParams consumers after a replace.
const { mockReplace, mockSearchParamsGet, setSearchParams, onMockReplace } =
  vi.hoisted(() => {
    const params = new Map<string, string>();
    const listeners = new Set<() => void>();
    return {
      mockReplace: vi.fn((url: string) => {
        params.clear();
        for (const [k, v] of new URL(url, "http://x").searchParams) params.set(k, v);
        for (const notify of listeners) notify();
      }),
      mockSearchParamsGet: vi.fn((key: string) => params.get(key) ?? null),
      setSearchParams: (entries: Record<string, string>) => {
        params.clear();
        for (const [k, v] of Object.entries(entries)) params.set(k, v);
      },
      onMockReplace: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/overview",
  useSearchParams: () => ({ get: (key: string) => mockSearchParamsGet(key) }),
  useParams: () => ({}),
}));

// Named base implementation so tests can override `get` and later delegate
// back to the original behaviour without capturing a previous override.
const baseGetImpl = (path: string) => {
  if (path === "/v1/admin/stats/org") {
    return Promise.resolve({
      total_users: 10,
      total_sessions: 100,
      total_messages: 5000,
      total_api_keys: 3,
      total_episodes: 25,
      total_facts: 200,
    });
  }
  if (path === "/v1/admin/audit-logs?limit=5") {
    return Promise.resolve({
      items: [
        {
          id: "1",
          action: "auth.login",
          actor_id: "user-1",
          actor_type: "user",
          created_at: new Date().toISOString(),
          status_code: 200,
          display_name: "User logged in",
        },
      ],
    });
  }
  if (path === "/v1/admin/quick-actions") {
    return Promise.resolve({
      actions: [
        { label: "View Sessions", href: "/projects", icon: "folder-kanban" },
        { label: "View Analytics", href: "/analytics", icon: "bar-chart-3" },
      ],
    });
  }
  if (path === "/v1/admin/stats/usage?days=7") {
    return Promise.resolve({
      data: [
        { date: "2025-07-01", message_count: 100, session_count: 10 },
        { date: "2025-07-02", message_count: 150, session_count: 12 },
      ],
    });
  }
  return Promise.resolve({});
};

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: vi.fn().mockImplementation((path: string) => baseGetImpl(path)),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideDashboard: () => <div>Guide Icon</div>,
}));

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockClear();
  mockSearchParamsGet.mockClear();
  setSearchParams({});
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("OverviewPage", () => {
  it("renders the page header", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(
      await screen.findByText(/activity pulse/),
    ).toBeInTheDocument();
  });

  it("renders the stat cards", () => {
    render(<OverviewPage />);
    // Stat-card labels repeat elsewhere on the page ("Messages"/"Sessions" in
    // the chart legend, "Users"/"Episodes" as trend mini-chart headings), so
    // every label must be queried with getAllByText. Labels are static — they
    // render synchronously regardless of API state.
    for (const label of ["Messages", "Sessions", "Facts", "Users", "Episodes", "API Keys"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders stat values from API", async () => {
    render(<OverviewPage />);
    const statCards = await screen.findAllByTestId("stat-card");
    expect(statCards).toHaveLength(6);
  });

  it("renders quick actions section", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText("Quick Actions")).toBeInTheDocument();
    expect(await screen.findByText("View Sessions")).toBeInTheDocument();
    expect(await screen.findByText("View Analytics")).toBeInTheDocument();
  });

  it("renders recent activity section", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(await screen.findByText("User logged in")).toBeInTheDocument();
  });

  it("renders view all link in recent activity", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText(/View all/)).toBeInTheDocument();
  });

  it("renders daily usage chart section", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText("Daily Usage")).toBeInTheDocument();
  });

  it("renders day filter buttons (7d, 30d, 90d)", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText("7d")).toBeInTheDocument();
    expect(await screen.findByText("30d")).toBeInTheDocument();
    expect(await screen.findByText("90d")).toBeInTheDocument();
  });

  // ── ?days= URL state ────────────────────────────────────────────────────────

  it("clamps an invalid ?days= value to the default range", async () => {
    setSearchParams({ days: "42" });
    render(<OverviewPage />);
    await screen.findByText("Daily Usage");

    // The usage fetch must use the clamped value, never the raw param.
    expect(get).toHaveBeenCalledWith("/v1/admin/stats/usage?days=7");
    expect(get).not.toHaveBeenCalledWith("/v1/admin/stats/usage?days=42");
    // The 7d pill is the active one.
    expect(screen.getByRole("button", { name: "7d" })).toHaveClass("bg-brand-500");
  });

  it("honours a valid ?days= deep link", async () => {
    setSearchParams({ days: "30" });
    render(<OverviewPage />);
    await screen.findByText("Daily Usage");

    expect(get).toHaveBeenCalledWith("/v1/admin/stats/usage?days=30");
    expect(screen.getByRole("button", { name: "30d" })).toHaveClass("bg-brand-500");
  });

  it("selecting a range pill writes ?days= via router.replace and refetches", async () => {
    const user = userEvent.setup();
    render(<OverviewPageHarness />);
    await screen.findByText("Daily Usage");

    vi.mocked(get).mockClear();
    await user.click(screen.getByRole("button", { name: "90d" }));

    expect(mockReplace).toHaveBeenCalledWith("/overview?days=90", { scroll: false });
    expect(
      vi.mocked(get).mock.calls.some(([path]) => path === "/v1/admin/stats/usage?days=90"),
    ).toBe(true);
  });

  it("renders guide section with dashboard illustration", async () => {
    render(<OverviewPage />);
    expect(
      await screen.findByText("Your organization at a glance"),
    ).toBeInTheDocument();
  });

  it("renders the quickstart panel for a fresh org with zero messages", async () => {
    const defaultImpl = vi.mocked(get).getMockImplementation() as (path: string) => Promise<unknown>;
    vi.mocked(get).mockImplementationOnce((path: string) => {
      if (path === "/v1/admin/stats/org") {
        return Promise.resolve({
          total_users: 0,
          total_sessions: 0,
          total_messages: 0,
          total_api_keys: 0,
          total_episodes: 0,
          total_facts: 0,
        });
      }
      return defaultImpl(path);
    });

    render(<OverviewPage />);
    expect(await screen.findByText("Get started in 3 steps")).toBeInTheDocument();
    expect(await screen.findByText("Create your first project")).toBeInTheDocument();
    expect(await screen.findByText("Ingest a conversation")).toBeInTheDocument();
    expect(await screen.findByText("Explore the knowledge graph")).toBeInTheDocument();
  });

  // ── Error-state regressions ──────────────────────────────────────────────────
  // The three fetches used to swallow errors with bare catch{} blocks, which
  // rendered a misleading "No recent activity found." on failure.

  it("shows an error state instead of 'No recent activity' when activity fetch fails", async () => {
    vi.mocked(get).mockImplementation((path: string) =>
      path === "/v1/admin/audit-logs?limit=5"
        ? Promise.reject(new Error("network down"))
        : baseGetImpl(path),
    );

    render(<OverviewPage />);

    expect(
      await screen.findByText("Couldn't load recent activity."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No recent activity found.")).not.toBeInTheDocument();
  });

  it("retry re-invokes the failed activity fetch", async () => {
    const user = userEvent.setup();
    let fail = true;
    vi.mocked(get).mockImplementation((path: string) => {
      if (path === "/v1/admin/audit-logs?limit=5") {
        return fail ? Promise.reject(new Error("network down")) : baseGetImpl(path);
      }
      return baseGetImpl(path);
    });

    render(<OverviewPage />);
    await screen.findByText("Couldn't load recent activity.");

    fail = false;
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("User logged in")).toBeInTheDocument();
  });

  it("shows an error state for quick actions failure", async () => {
    vi.mocked(get).mockImplementation((path: string) =>
      path === "/v1/admin/quick-actions"
        ? Promise.reject(new Error("network down"))
        : baseGetImpl(path),
    );

    render(<OverviewPage />);
    expect(await screen.findByText("Couldn't load quick actions.")).toBeInTheDocument();
    expect(screen.queryByText("View Sessions")).not.toBeInTheDocument();
  });

  it("shows an error state for stats failure", async () => {
    vi.mocked(get).mockImplementation((path: string) =>
      path === "/v1/admin/stats/org"
        ? Promise.reject(new Error("network down"))
        : baseGetImpl(path),
    );

    render(<OverviewPage />);
    expect(
      await screen.findByText("Couldn't load organization stats."),
    ).toBeInTheDocument();
  });
});
