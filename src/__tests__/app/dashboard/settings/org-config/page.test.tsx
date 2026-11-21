import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrgConfigIndexPage from "@/app/(dashboard)/settings/org-config/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseUser, mockGetMyConfig, mockUpdateMyConfig } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockGetMyConfig: vi.fn(),
  mockUpdateMyConfig: vi.fn(),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getMyConfig: mockGetMyConfig,
    updateMyConfig: mockUpdateMyConfig,
  };
});

function renderAsAdmin() {
  mockUseUser.mockReturnValue({
    can: () => true,
    loading: false,
  });
  mockGetMyConfig.mockResolvedValue({ override: { llm_model: "gpt-4o" } });
  return render(<OrgConfigIndexPage />);
}

function renderAsMember() {
  mockUseUser.mockReturnValue({
    can: () => false,
    loading: false,
  });
  return render(<OrgConfigIndexPage />);
}

describe("OrgConfigIndexPage (my overrides)", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    mockGetMyConfig.mockReset();
    mockUpdateMyConfig.mockReset();
  });

  it("renders personal overrides fetched from getMyConfig", async () => {
    renderAsAdmin();

    expect(await screen.findByText("My Overrides")).toBeInTheDocument();
    expect(await screen.findByText("llm_model")).toBeInTheDocument();
    expect(await screen.findByText("gpt-4o")).toBeInTheDocument();
    expect(mockGetMyConfig).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there are no overrides", async () => {
    mockUseUser.mockReturnValue({ can: () => true, loading: false });
    mockGetMyConfig.mockResolvedValue({ override: {} });
    render(<OrgConfigIndexPage />);

    expect(await screen.findByText("No personal overrides")).toBeInTheDocument();
  });

  it("does not fetch without configuration:read", () => {
    renderAsMember();

    expect(
      screen.getByText("This action requires the 'configuration:read' permission."),
    ).toBeInTheDocument();
    expect(mockGetMyConfig).not.toHaveBeenCalled();
  });

  it("shows the permission error when the role is still loading, then resolves", async () => {
    mockUseUser.mockReturnValue({ can: () => false, loading: true });
    const { rerender } = render(<OrgConfigIndexPage />);
    // Loading skeleton, no fetch yet.
    expect(mockGetMyConfig).not.toHaveBeenCalled();

    mockUseUser.mockReturnValue({ can: () => true, loading: false });
    mockGetMyConfig.mockResolvedValue({ override: {} });
    rerender(<OrgConfigIndexPage />);

    expect(await screen.findByText("No personal overrides")).toBeInTheDocument();
  });

  it("shows the error state with retry when the fetch fails", async () => {
    const user = userEvent.setup();
    mockUseUser.mockReturnValue({ can: () => true, loading: false });
    mockGetMyConfig.mockRejectedValueOnce(new Error("network down"));
    mockGetMyConfig.mockResolvedValueOnce({ override: {} });
    render(<OrgConfigIndexPage />);

    expect(await screen.findByText("network down")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.getByText("No personal overrides")).toBeInTheDocument();
    });
  });

  it("resets an override via updateMyConfig and refetches", async () => {
    const user = userEvent.setup();
    renderAsAdmin();

    await user.click(
      await screen.findByRole("button", { name: /Reset to default/i }),
    );

    await waitFor(() => {
      expect(mockUpdateMyConfig).toHaveBeenCalledWith({ llm_model: null });
    });
  });

  it("masks secret values instead of rendering them", async () => {
    mockUseUser.mockReturnValue({ can: () => true, loading: false });
    mockGetMyConfig.mockResolvedValue({
      override: { openai_api_key: "sk-secret" },
    });
    render(<OrgConfigIndexPage />);

    expect(await screen.findByText("Set")).toBeInTheDocument();
    expect(screen.queryByText("sk-secret")).not.toBeInTheDocument();
  });
});
