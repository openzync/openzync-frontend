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
  });

  it("falls back to [] when system_managed_fields is missing (old backend) → shows input", async () => {
    mockGetMyConfig.mockResolvedValue({ override: {}, effective: {} });
    renderPage();

    expect(await screen.findByLabelText("FalkorDB URL")).toBeInTheDocument();
    expect(
      screen.queryByText(/Configured at the system level/),
    ).not.toBeInTheDocument();
  });

  it('shows the badge when system_managed_fields is ["falkordb_url"]', async () => {
    mockGetMyConfig.mockResolvedValue({
      override: {},
      effective: {},
      system_managed_fields: ["falkordb_url"],
    });
    renderPage();

    expect(
      await screen.findByText(/Configured at the system level/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("FalkorDB URL")).not.toBeInTheDocument();
  });
});
