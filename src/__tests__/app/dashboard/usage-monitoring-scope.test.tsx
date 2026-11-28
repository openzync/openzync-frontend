import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import UsagePage from "@/app/(dashboard)/usage/page";
import MonitoringPage from "@/app/(dashboard)/monitoring/page";
import { get, getLlmUsage } from "@/lib/api-client";
import type { LlmUsageParams } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const { mockUseUser, setSearchParams, searchParams } = vi.hoisted(() => {
  const params = new Map<string, string>();
  return {
    mockUseUser: vi.fn(),
    setSearchParams: (entries: Record<string, string>) => {
      params.clear();
      for (const [k, v] of Object.entries(entries)) params.set(k, v);
    },
    searchParams: () => new URLSearchParams([...params]),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/usage",
  useSearchParams: () => searchParams(),
  useParams: () => ({}),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

const baseGetImpl = (path: string) => {
  if (path === "/v1/users") {
    return Promise.resolve({ data: [{ id: "u-1", name: "Alice" }] });
  }
  if (path === "/v1/projects?limit=100") {
    return Promise.resolve({ data: [{ id: "p-1", name: "P1" }] });
  }
  if (path.startsWith("/v1/admin/llm-usage")) {
    return Promise.resolve({ data: [], total: 0, summary: null });
  }
  if (path.startsWith("/metrics/summary")) {
    return Promise.resolve({
      status: "ok",
      episodes: {
        enrichable_total: 0,
        with_embeddings: 0,
        in_progress: 0,
        fully_enriched_pct: 0,
      },
      error_rate_pct: 0,
      graphs: { entities_total: 0 },
      queue_depth: null,
      active_requests: 0,
      request_rate: { "2xx": 0, "5xx": 0 },
      overall_latency_ms: { p50: 0, p95: 0, p99: 0 },
      context_latency_ms: { p50: 0, p95: 0, p99: 0 },
      graph_search_latency_ms: { p50: 0, p95: 0, p99: 0 },
    });
  }
  if (path.startsWith("/metrics/batch")) {
    return Promise.resolve({ results: {}, errors: [], meta: {} });
  }
  if (path === "/metrics/targets") {
    return Promise.resolve({ status: "ok", targets: [] });
  }
  return Promise.resolve({});
};

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: vi.fn().mockImplementation((path: string) => baseGetImpl(path)),
  // getLlmUsage closes over the module-internal get — route it through
  // the same canned endpoints so scope params stay observable.
  getLlmUsage: vi.fn().mockImplementation((params: LlmUsageParams = {}) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }
    const suffix = query.size ? `?${query}` : "";
    return baseGetImpl(`/v1/admin/llm-usage${suffix}`);
  }),
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
  GuideDashboard: () => <div>Guide Icon</div>,
}));

vi.mock("@/components/shared/charts", () => ({
  BarChart: () => <div data-testid="bar-chart" />,
  LineChart: () => <div data-testid="line-chart" />,
  StackedBarChart: () => <div data-testid="stacked-bar-chart" />,
  ChartLegend: () => <div data-testid="chart-legend" />,
  cssVar: (name: string) => `var(${name})`,
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
    user: { id: "u9", role: "member" as const, permissions: ["project:read"] },
    role: "member" as const,
    permissions: ["project:read"],
    isAdmin: false,
    can: () => false,
    mustChangePassword: false,
    loading: false,
  };
}

// jsdom lacks the PointerEvent APIs Radix Select relies on.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  mockUseUser.mockReset();
  setSearchParams({});
  vi.mocked(get).mockImplementation((path: string) => baseGetImpl(path));
  vi.mocked(getLlmUsage).mockImplementation((params: LlmUsageParams = {}) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }
    const suffix = query.size ? `?${query}` : "";
    return baseGetImpl(`/v1/admin/llm-usage${suffix}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("Usage page platform scope filter", () => {
  it("holder sees the User dropdown and Site-wide badge", async () => {
    mockUseUser.mockReturnValue(holderMock());
    render(<UsagePage />);
    expect(
      await screen.findByRole("combobox", { name: "Filter by user" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Site-wide")).toBeInTheDocument();
  });

  it("plain member sees neither the dropdown nor the site badge", async () => {
    mockUseUser.mockReturnValue(memberMock());
    render(<UsagePage />);
    await screen.findByText("Usage");
    expect(
      screen.queryByRole("combobox", { name: "Filter by user" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Personal")).toBeInTheDocument();
  });

  it("?user_id= narrows the badge and the fetch to that user", async () => {
    mockUseUser.mockReturnValue(holderMock());
    setSearchParams({ user_id: "u-9" });
    render(<UsagePage />);
    expect(await screen.findByText("User: u-9")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(
        vi
          .mocked(getLlmUsage)
          .mock.calls.some(
            ([params]) => (params as LlmUsageParams).user_id === "u-9",
          ),
      ).toBe(true);
    });
  });
});

describe("Monitoring page platform scope filter", () => {
  it("holder sees the User dropdown and Site-wide badge", async () => {
    mockUseUser.mockReturnValue(holderMock());
    render(<MonitoringPage />);
    expect(
      await screen.findByRole("combobox", { name: "Filter by user" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Site-wide")).toBeInTheDocument();
  });

  it("plain member sees neither the dropdown nor the site badge", async () => {
    mockUseUser.mockReturnValue(memberMock());
    render(<MonitoringPage />);
    await screen.findByText("Monitoring");
    expect(
      screen.queryByRole("combobox", { name: "Filter by user" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Personal")).toBeInTheDocument();
  });

  it("?project= maps to project_id on the batch fetch (pin)", async () => {
    mockUseUser.mockReturnValue(holderMock());
    setSearchParams({ project: "p-1" });
    render(<MonitoringPage />);
    expect(await screen.findByText("Project: P1")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(
        vi
          .mocked(get)
          .mock.calls.some(
            ([p]) =>
              String(p).startsWith("/metrics/batch") &&
              String(p).includes("project_id=p-1"),
          ),
      ).toBe(true);
    });
  });
});
