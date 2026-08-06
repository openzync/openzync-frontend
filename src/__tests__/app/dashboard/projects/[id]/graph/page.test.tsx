import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphExplorerPage from "@/app/(dashboard)/projects/[id]/graph/page";
import { get } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

// Stub the D3-backed ForceGraph so no d3 runs in jsdom. Referenced lazily inside
// the factory (same pattern as the mockPush mock in the other page tests).
const ForceGraphMock = vi.fn(({ nodes }: { nodes: unknown[] }) => (
  <div data-testid="force-graph">{nodes.length} nodes</div>
));

vi.mock("@/components/force-graph", () => ({
  ForceGraph: (props: never) => ForceGraphMock(props),
}));

const mockProject = {
  id: "project-123",
  name: "Test Project",
  description: "A test project",
  metadata: {},
  is_archived: false,
  member_count: 3,
  created_by: "user-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
};

vi.mock("@/stores/project-context", () => ({
  useProject: () => ({
    project: mockProject,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  get: vi.fn(),
  API_BASE: "http://localhost:8000",
  getAccessToken: () => null,
}));

vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
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
  GuideGraph: () => <div>Graph Icon</div>,
}));

const node = {
  id: "n1",
  name: "Node 1",
  type: "person",
  summary: null,
  created_at: "2025-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("GraphExplorerPage", () => {
  it("renders the truncation notice when has_more is true", async () => {
    vi.mocked(get).mockImplementation((path: string) => {
      if (path.includes("/graph/nodes")) {
        return Promise.resolve({ data: { items: [node], has_more: true } });
      }
      if (path.includes("/graph/edges")) {
        return Promise.resolve({ data: { items: [] } });
      }
      return Promise.resolve({});
    });

    render(<GraphExplorerPage />);

    expect(
      await screen.findByText(/Showing the first 100 entities/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("force-graph")).toBeInTheDocument();
    expect(ForceGraphMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [node] }),
    );
  });

  it("does not render the truncation notice when has_more is false", async () => {
    vi.mocked(get).mockImplementation((path: string) => {
      if (path.includes("/graph/nodes")) {
        return Promise.resolve({ data: { items: [node], has_more: false } });
      }
      if (path.includes("/graph/edges")) {
        return Promise.resolve({ data: { items: [] } });
      }
      return Promise.resolve({});
    });

    render(<GraphExplorerPage />);

    await screen.findByTestId("force-graph");
    expect(
      screen.queryByText(/Showing the first 100 entities/),
    ).not.toBeInTheDocument();
  });

  it("does not render the truncation notice when there are no nodes", async () => {
    vi.mocked(get).mockImplementation((path: string) => {
      if (path.includes("/graph/nodes")) {
        return Promise.resolve({ data: { items: [], has_more: true } });
      }
      return Promise.resolve({});
    });

    render(<GraphExplorerPage />);

    await screen.findByTestId("force-graph");
    expect(
      screen.queryByText(/Showing the first 100 entities/),
    ).not.toBeInTheDocument();
  });
});
