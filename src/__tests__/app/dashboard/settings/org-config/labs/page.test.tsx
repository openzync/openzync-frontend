import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LabsConfigPage from "@/app/(dashboard)/settings/org-config/labs/page";
import { ConfigDirtyProvider } from "@/contexts/config-dirty";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGetMyConfig, mockUpdateMyConfig } = vi.hoisted(() => ({
  mockGetMyConfig: vi.fn(),
  mockUpdateMyConfig: vi.fn(),
}));

// ConfigDirtyProvider (mounted by renderPage) reads router/pathname.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings/org-config/labs",
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
      <LabsConfigPage />
    </ConfigDirtyProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
// No reset buttons by design — edits save the whole gate block, and an
// untouched gate sends nothing.

describe("LabsConfigPage enrichment gate", () => {
  beforeEach(() => {
    mockGetMyConfig.mockReset();
    mockUpdateMyConfig.mockReset();
    mockUpdateMyConfig.mockResolvedValue({ override: {}, effective: {} });
  });

  it("gate Enabled + Threshold save sends updateMyConfig {enrichment_gate:{enabled,threshold}}", async () => {
    const user = userEvent.setup();
    mockGetMyConfig.mockResolvedValue({
      override: { enrichment_gate: { enabled: false, threshold: 0.5 } },
      effective: {},
    });
    renderPage();

    await user.click(await screen.findByRole("switch"));
    fireEvent.change(await screen.findByLabelText("Threshold"), {
      target: { value: "0.8" },
    });
    await user.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockUpdateMyConfig).toHaveBeenCalledWith({
        enrichment_gate: { enabled: true, threshold: 0.8 },
      });
    });
  });

  it("has no reset UI — no reset button or staged-reset note, even with a stored override", async () => {
    mockGetMyConfig.mockResolvedValue({
      override: { enrichment_gate: { enabled: true, threshold: 0.7 } },
      effective: {},
    });
    renderPage();

    await screen.findByRole("switch");

    expect(screen.queryByTitle("Reset gate to default")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Will reset to default on save"),
    ).not.toBeInTheDocument();
  });

  it("upcoming-switches placeholder is present as plain text", async () => {
    mockGetMyConfig.mockResolvedValue({ override: {}, effective: {} });
    renderPage();

    const note = await screen.findByText(
      "Upcoming feature switches will appear here.",
    );
    expect(note).toBeInTheDocument();
    // Plain text — not a link or a button.
    expect(note.closest("a,button")).toBeNull();
  });
});
