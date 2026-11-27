import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnrichmentConfigPage from "@/app/(dashboard)/settings/platform-config/enrichment/page";
import { ConfigDirtyProvider } from "@/contexts/config-dirty";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGetMyConfig, mockUpdateMyConfig } = vi.hoisted(() => ({
  mockGetMyConfig: vi.fn(),
  mockUpdateMyConfig: vi.fn(),
}));

// ConfigDirtyProvider (mounted by renderPage) reads router/pathname.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings/platform-config/enrichment",
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
      <EnrichmentConfigPage />
    </ConfigDirtyProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("EnrichmentConfigPage toggles-only", () => {
  beforeEach(() => {
    mockGetMyConfig.mockReset();
    mockUpdateMyConfig.mockReset();
    mockUpdateMyConfig.mockResolvedValue({ override: {}, effective: {} });
    mockGetMyConfig.mockResolvedValue({ override: {}, effective: {} });
  });

  it("has no enrichment_gate refs — no gate card, switch, or threshold slider", async () => {
    const { container } = renderPage();

    await screen.findByText("Enrichment Settings");

    expect(screen.queryByText("Enrichment Gate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Threshold")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });

  it("toggle save sends {enrichment} only — no enrichment_gate key", async () => {
    const user = userEvent.setup();
    renderPage();

    // FIELDS order: entities, embedding, facts, entity_links, classification, …
    const boxes = await screen.findAllByRole("checkbox");
    await user.click(boxes[4]); // classification off
    await user.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockUpdateMyConfig).toHaveBeenCalledWith({
        enrichment: { classification: false },
      });
    });
  });
});
