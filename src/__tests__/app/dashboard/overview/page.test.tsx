import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import OverviewPage from "@/app/(dashboard)/overview/page";
import { get } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/lib/api-client", () => ({
  get: vi.fn().mockImplementation((path: string) => {
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
  }),
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
      await screen.findByText(/Organization dashboard/),
    ).toBeInTheDocument();
  });

  it("renders the stat cards", async () => {
    render(<OverviewPage />);
    // "Messages" appears in stats and chart legend — use getAllByText
    const messages = await screen.findAllByText("Messages");
    expect(messages.length).toBeGreaterThanOrEqual(1);
    // "Sessions" also appears in stat cards and chart legend
    const sessions = await screen.findAllByText("Sessions");
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("Facts")).toBeInTheDocument();
    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(await screen.findByText("Episodes")).toBeInTheDocument();
    expect(await screen.findByText("API Keys")).toBeInTheDocument();
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
});
