import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuperadminConfigPage from "@/app/(dashboard)/superadmin/config/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPatch, mockGetSettings, mockRevealSetting } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockGetSettings: vi.fn(),
  mockRevealSetting: vi.fn(),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
    get isForbidden(): boolean {
      return this.status === 403;
    }
  }
  return {
    get: mockGet,
    patch: mockPatch,
    getSystemSettings: mockGetSettings,
    revealSystemSetting: mockRevealSetting,
    ApiError,
    apiErrorMessage: (err: unknown, fallback: string) =>
      err instanceof ApiError && err.isForbidden ? "Admin access required" : fallback,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/shared/error-state", () => ({
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALLOW_ALL_CONFIG = {
  org_creation_policy: "allow_all",
  approval_scope: "in_app",
  llm_backend: "openai",
  llm_model: "",
  context_cache_ttl: 1800,
};

const SETTINGS_FIXTURE = {
  data: [
    {
      key: "OZ_DATABASE_URL",
      category: "Infrastructure",
      is_set: true,
      masked_value: "postgresql+asyncpg://db.example.com:5432",
    },
    {
      key: "OZ_SECRET_KEY",
      category: "Security",
      is_set: false,
      masked_value: null,
    },
  ],
};

function renderPage() {
  return render(<SuperadminConfigPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("SuperadminConfigPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
    mockGetSettings.mockReset();
    mockRevealSetting.mockReset();
    mockGetSettings.mockResolvedValue(SETTINGS_FIXTURE);
  });

  it("PATCHes the right body when the policy and scope change", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    mockPatch.mockResolvedValue({ ...ALLOW_ALL_CONFIG, org_creation_policy: "approvals", approval_scope: "public_signup" });
    renderPage();

    // Radios render from the fetched policy; clicking the label toggles it.
    await user.click(await screen.findByText("Approval required"));
    // Scope becomes enabled once approvals is selected; pick public signup.
    await user.selectOptions(screen.getByRole("combobox", { name: "Approval Scope" }), "public_signup");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/system/config", {
        org_creation_policy: "approvals",
        approval_scope: "public_signup",
      });
    });
  });

  it("disables the scope select when the policy is not approvals", async () => {
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    renderPage();

    const scope = await screen.findByRole("combobox", { name: "Approval Scope" });
    expect(scope).toBeDisabled();

    // Selecting the approvals policy re-enables it.
    const user = userEvent.setup();
    await user.click(screen.getByText("Approval required"));
    expect(screen.getByRole("combobox", { name: "Approval Scope" })).not.toBeDisabled();
  });

  it("PATCHes changed default fields alongside policy changes", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    mockPatch.mockResolvedValue(ALLOW_ALL_CONFIG);
    renderPage();

    await user.type(await screen.findByLabelText("LLM Model"), "gpt-4o");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/system/config", {
        llm_model: "gpt-4o",
      });
    });
  });

  it("does not PATCH when nothing changed", async () => {
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    renderPage();

    const saveButton = await screen.findByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeDisabled();
  });

  it("renders the error state with retry when the config fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("Failed to load system configuration"));
    renderPage();

    expect(await screen.findByText("Failed to load system configuration")).toBeInTheDocument();
  });

  // ─── Runtime settings card ──────────────────────────────────────────────

  it("renders masked values with a Reveal button and 'Not set' for unset keys", async () => {
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    renderPage();

    expect(await screen.findByText("System Settings (runtime)")).toBeInTheDocument();
    // Category heading for the set key's group.
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    // Masked value shown for the set key.
    expect(screen.getByText("postgresql+asyncpg://db.example.com:5432")).toBeInTheDocument();
    // Reveal button on the set row; unset key shows grey "Not set" and no button.
    expect(screen.getByRole("button", { name: "Reveal" })).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide" })).not.toBeInTheDocument();
  });

  it("reveals the raw value on click and swaps the button to Hide", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    mockRevealSetting.mockResolvedValue({
      key: "OZ_DATABASE_URL",
      value: "postgresql+asyncpg://user:pass@db.example.com:5432/mydb",
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reveal" }));

    await waitFor(() => {
      expect(mockRevealSetting).toHaveBeenCalledWith("OZ_DATABASE_URL");
    });
    // Raw value replaces the masked value; button flips to Hide.
    expect(await screen.findByText("postgresql+asyncpg://user:pass@db.example.com:5432/mydb")).toBeInTheDocument();
    expect(screen.queryByText("postgresql+asyncpg://db.example.com:5432")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("hides the raw value without refetching the reveal endpoint", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(ALLOW_ALL_CONFIG);
    mockRevealSetting.mockResolvedValue({
      key: "OZ_DATABASE_URL",
      value: "postgresql+asyncpg://user:pass@db.example.com:5432/mydb",
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reveal" }));
    await screen.findByText("postgresql+asyncpg://user:pass@db.example.com:5432/mydb");
    await user.click(screen.getByRole("button", { name: "Hide" }));

    // Masked value is back, reveal endpoint called exactly once (no refetch).
    expect(await screen.findByText("postgresql+asyncpg://db.example.com:5432")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal" })).toBeInTheDocument();
    expect(mockRevealSetting).toHaveBeenCalledTimes(1);
  });
});
