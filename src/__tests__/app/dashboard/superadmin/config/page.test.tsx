import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuperadminConfigPage from "@/app/(dashboard)/superadmin/config/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
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

function renderPage() {
  return render(<SuperadminConfigPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("SuperadminConfigPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
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
});
