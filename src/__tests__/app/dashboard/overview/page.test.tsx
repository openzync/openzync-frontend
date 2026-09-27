import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect, useReducer } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
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
// Stateful URL simulation: router.replace writes the query string back into the
// search-param mock and notifies subscribers, mirroring how real Next.js
// re-renders useSearchParams consumers after a replace.
const { mockReplace, mockSearchParamsGet, setSearchParams, onMockReplace, searchParams } =
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
      // A real URLSearchParams: the page rebuilds the query string from
      // searchParams.toString(), so a `{get}`-only stub would serialise
      // "[object Object]" as a param name.
      searchParams: () => new URLSearchParams([...params]),
    };
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/overview",
  useSearchParams: () => searchParams(),
  useParams: () => ({}),
}));

const PROJECTS = [
  { id: "p-1", name: "Customer Support Bot" },
  { id: "p-2", name: "Data Extraction Pipeline" },
];

/** Query string of a fetched path, e.g. "/v1/admin/stats/usage?days=30". */
function qs(path: string): URLSearchParams {
  return new URLSearchParams(path.split("?")[1] ?? "");
}

const ORG_STATS = {
  total_episodes: 25,
  total_sessions: 100,
  total_facts: 200,
  total_extractions: 40,
  total_observations: 12,
  total_classifications: 7,
};

const USAGE = [
  // Newest-first on the wire — the page sorts oldest-first before charting.
  { date: "2025-07-02", episode_count: 12, session_count: 3, fact_count: 20, extraction_count: 4, observation_count: 2, classification_count: 1, node_count: 40, edge_count: 90 },
  { date: "2025-07-01", episode_count: 10, session_count: 2, fact_count: 15, extraction_count: 3, observation_count: 1, classification_count: 1, node_count: 30, edge_count: 70 },
];

// Named base implementation so tests can override `get` and later delegate
// back to the original behaviour without capturing a previous override.
// Every dashboard endpoint is windowed with `?<qs>` (days=… or from/to, plus an
// optional project_id) — so dispatch on the path, not the exact URL.
const baseGetImpl = (path: string) => {
  if (path === "/v1/projects?limit=100") {
    return Promise.resolve({ data: PROJECTS });
  }
  if (path.startsWith("/v1/admin/stats/org")) {
    return Promise.resolve(ORG_STATS);
  }
  if (path.startsWith("/v1/admin/stats/usage")) {
    return Promise.resolve({ data: USAGE });
  }
  if (path === "/v1/admin/quick-actions") {
    return Promise.resolve({
      actions: [
        { label: "View Sessions", href: "/projects", icon: "folder-kanban" },
        { label: "View Analytics", href: "/analytics", icon: "bar-chart-3" },
      ],
    });
  }
  return Promise.resolve({});
};

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: vi.fn().mockImplementation((path: string) => baseGetImpl(path)),
}));

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

// recharts needs real layout metrics; the panels and their headings are the
// contract under test, not the SVG internals.
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

/** URLs of every usage-window fetch, oldest-to-newest. */
function usageCalls(): string[] {
  return vi
    .mocked(get)
    .mock.calls.map(([path]) => String(path))
    .filter((p) => p.startsWith("/v1/admin/stats/usage"));
}

function timeRange() {
  return screen.getByLabelText("Filter by time range") as HTMLSelectElement;
}

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockClear();
  mockSearchParamsGet.mockClear();
  setSearchParams({});
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

  it("renders the stat cards", async () => {
    render(<OverviewPage />);
    // Labels repeat as trend-panel headings, so every label must be queried
    // with getAllByText. Labels are static — they render synchronously
    // regardless of API state.
    for (const label of ["Episodes", "Sessions", "Facts", "Extractions", "Observations", "Classifications"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders stat values from API", async () => {
    render(<OverviewPage />);
    const statCards = await screen.findAllByTestId("stat-card");
    expect(statCards).toHaveLength(6);
    // The mocked card renders the raw value — the first card is Episodes.
    expect(statCards[0]).toHaveTextContent("Episodes");
    expect(statCards[0]).toHaveTextContent("25");
  });

  it("renders quick actions section", async () => {
    render(<OverviewPage />);
    expect(await screen.findByText("Quick Actions")).toBeInTheDocument();
    expect(await screen.findByText("View Sessions")).toBeInTheDocument();
    expect(await screen.findByText("View Analytics")).toBeInTheDocument();
  });

  it("renders a trend panel per artifact plus the graph section", async () => {
    render(<OverviewPage />);

    // One panel per artifact series, each a chart once usage arrives.
    await screen.findAllByTestId("bar-chart");
    for (const label of ["Episodes", "Sessions", "Facts", "Extractions", "Observations", "Classifications"]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    // The big graph panel is a 7th chart (nodes/edges), so 7 total.
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(7);
    expect(screen.getByRole("heading", { name: "Graph" })).toBeInTheDocument();
  });

  it("populates the project filter from the project list endpoint", async () => {
    render(<OverviewPage />);

    const select = (await screen.findByLabelText(
      "Filter by project",
    )) as HTMLSelectElement;
    expect(select).toHaveValue("");
    expect(
      within(select).getByRole("option", { name: "All projects" }),
    ).toBeInTheDocument();
    for (const p of PROJECTS) {
      expect(within(select).getByRole("option", { name: p.name })).toBeInTheDocument();
    }
    expect(get).toHaveBeenCalledWith("/v1/projects?limit=100");
  });

  it("renders the time range filter with the 7/30/90-day presets and a custom option", () => {
    render(<OverviewPage />);

    const select = timeRange();
    expect(
      Array.from(select.options).map((o) => [o.value, o.textContent]),
    ).toEqual([
      ["7", "Last 7 days"],
      ["30", "Last 30 days"],
      ["90", "Last 90 days"],
      ["custom", "Custom range"],
    ]);
    // Default window is 30 days.
    expect(select).toHaveValue("30");
  });

  it("filters the window by project: ?project= becomes project_id on both fetches", async () => {
    const user = userEvent.setup();
    render(<OverviewPageHarness />);
    await screen.findByText("Quick Actions");

    await user.selectOptions(screen.getByLabelText("Filter by project"), "p-1");

    // Only the params the page owns are written — days stays implicit at 30.
    expect(mockReplace).toHaveBeenCalledWith(
      "/overview?project=p-1",
      { scroll: false },
    );
    await vi.waitFor(() => {
      expect(
        usageCalls().some((p) => qs(p).get("project_id") === "p-1"),
      ).toBe(true);
    });
    expect(vi.mocked(get).mock.calls.some(
      ([p]) => String(p).startsWith("/v1/admin/stats/org") && qs(String(p)).get("project_id") === "p-1",
    )).toBe(true);
  });

  // ── ?days= URL state ────────────────────────────────────────────────────────

  it("clamps an unsupported ?days= value to the 30-day default", async () => {
    setSearchParams({ days: "42" });
    render(<OverviewPage />);
    await screen.findByText("Quick Actions");

    // The usage fetch must use the clamped value, never the raw param.
    expect(get).toHaveBeenCalledWith("/v1/admin/stats/usage?days=30");
    expect(get).not.toHaveBeenCalledWith("/v1/admin/stats/usage?days=42");
    expect(timeRange()).toHaveValue("30");
  });

  it("honours a valid ?days= deep link", async () => {
    setSearchParams({ days: "7" });
    render(<OverviewPage />);
    await screen.findByText("Quick Actions");

    expect(get).toHaveBeenCalledWith("/v1/admin/stats/usage?days=7");
    expect(timeRange()).toHaveValue("7");
  });

  it("selecting a range writes ?days= via router.replace and refetches", async () => {
    const user = userEvent.setup();
    render(<OverviewPageHarness />);
    await screen.findByText("Quick Actions");

    vi.mocked(get).mockClear();
    await user.selectOptions(timeRange(), "90");

    expect(mockReplace).toHaveBeenCalledWith("/overview?days=90", { scroll: false });
    await vi.waitFor(() => {
      expect(usageCalls()).toContain("/v1/admin/stats/usage?days=90");
    });
  });

  it("applies a custom from/to range, replacing the days preset", async () => {
    const user = userEvent.setup();
    setSearchParams({ days: "7" });
    render(<OverviewPageHarness />);
    await screen.findByText("Quick Actions");

    await user.selectOptions(timeRange(), "custom");
    // Date inputs don't take per-key typing in jsdom — set the value directly.
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2025-06-01" },
    });
    fireEvent.change(screen.getByLabelText("To date"), {
      target: { value: "2025-06-30" },
    });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // The custom window replaces the preset, and Clear restores days=30.
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/overview?from=2025-06-01&to=2025-06-30",
      { scroll: false },
    );
    expect(usageCalls()).toContain(
      "/v1/admin/stats/usage?from=2025-06-01&to=2025-06-30",
    );

    await user.click(await screen.findByRole("button", { name: "Clear" }));
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/overview?days=30",
      { scroll: false },
    );
  });

  it("renders guide section with dashboard illustration", async () => {
    render(<OverviewPage />);
    expect(
      await screen.findByText("Your organization at a glance"),
    ).toBeInTheDocument();
  });

  it("renders the quickstart panel for a fresh org with zero episodes", async () => {
    // Path-scoped (not ...Once): the project dropdown fetches /v1/projects
    // before the stats window, so a positional override would miss.
    const defaultImpl = vi.mocked(get).getMockImplementation() as (path: string) => Promise<unknown>;
    vi.mocked(get).mockImplementation((path: string) => {
      if (path.startsWith("/v1/admin/stats/org")) {
        return Promise.resolve({
          total_episodes: 0,
          total_sessions: 0,
          total_facts: 0,
          total_extractions: 0,
          total_observations: 0,
          total_classifications: 0,
        });
      }
      return defaultImpl(path);
    });

    render(<OverviewPage />);
    expect(await screen.findByText("Get started in 3 steps")).toBeInTheDocument();
    expect(await screen.findByText("Create your first project")).toBeInTheDocument();
    expect(await screen.findByText("Create a project")).toBeInTheDocument();
    expect(await screen.findByText("Ingest a conversation")).toBeInTheDocument();
    expect(await screen.findByText("Explore the knowledge graph")).toBeInTheDocument();
  });

  // ── Error-state regressions ──────────────────────────────────────────────────
  // The stat/usage fetches used to swallow errors with bare catch{} blocks,
  // which rendered a misleading "No data for this period." on failure.

  it("shows an error state instead of the stat cards when the stats fetch fails", async () => {
    vi.mocked(get).mockImplementation((path: string) =>
      path.startsWith("/v1/admin/stats/org")
        ? Promise.reject(new Error("network down"))
        : baseGetImpl(path),
    );

    render(<OverviewPage />);

    expect(
      await screen.findByText("Couldn't load organization stats."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("stat-card")).not.toBeInTheDocument();
  });

  it("retry re-invokes the failed stats fetch", async () => {
    const user = userEvent.setup();
    let fail = true;
    vi.mocked(get).mockImplementation((path: string) => {
      if (path.startsWith("/v1/admin/stats/org")) {
        return fail ? Promise.reject(new Error("network down")) : baseGetImpl(path);
      }
      return baseGetImpl(path);
    });

    render(<OverviewPage />);
    await screen.findByText("Couldn't load organization stats.");

    fail = false;
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findAllByTestId("stat-card")).toHaveLength(6);
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
});
