import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphConfigPage from "@/app/(dashboard)/settings/platform-config/graph/page";
import { ConfigDirtyProvider } from "@/contexts/config-dirty";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGetMyConfig, mockUpdateMyConfig } = vi.hoisted(() => ({
  mockGetMyConfig: vi.fn(),
  mockUpdateMyConfig: vi.fn(),
}));

// ConfigDirtyProvider (mounted by renderPage) reads router/pathname.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings/platform-config/graph",
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getMyConfig: mockGetMyConfig,
    updateMyConfig: mockUpdateMyConfig,
  };
});

function renderPage() {
  return render(
    <ConfigDirtyProvider>
      <GraphConfigPage />
    </ConfigDirtyProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("GraphConfigPage system-managed mapping", () => {
  beforeEach(() => {
    mockGetMyConfig.mockReset();
    mockUpdateMyConfig.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          graphs: {
            falkordb: { configured: true, reachable: true },
            surrealdb: { configured: true, reachable: true },
          },
        }),
      }),
    );
  });

  it("renders the kept fields with no connection inputs or system badges", async () => {
    mockGetMyConfig.mockResolvedValue({ override: {}, effective: {} });
    renderPage();

    expect(await screen.findByText("Graph Settings")).toBeInTheDocument();
    expect(screen.getByText("Graph Backend")).toBeInTheDocument();
    expect(screen.getByText("Search Type")).toBeInTheDocument();
    expect(screen.getByText("Max Traversal Depth")).toBeInTheDocument();
    expect(screen.queryByLabelText("FalkorDB URL")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Configured at the system level/),
    ).not.toBeInTheDocument();
  });

  it('ignores legacy system_managed_fields ["falkordb_url"] without showing a badge', async () => {
    mockGetMyConfig.mockResolvedValue({
      override: {},
      effective: {},
      system_managed_fields: ["falkordb_url"],
    });
    renderPage();

    expect(await screen.findByText("Graph Settings")).toBeInTheDocument();
    expect(
      screen.queryByText(/Configured at the system level/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("FalkorDB URL")).not.toBeInTheDocument();
  });
});
