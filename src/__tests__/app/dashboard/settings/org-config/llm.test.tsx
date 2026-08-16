import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LlmConfigPage from "@/app/(dashboard)/settings/org-config/llm/page";
import { ConfigDirtyProvider } from "@/contexts/config-dirty";

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

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const STORED = {
  stored: {
    prompt_caching: {
      enabled: true,
      anthropic_min_tokens: 1024,
      anthropic_cache_ttl: "5m",
    },
  },
};

const RESET_TITLE = "Remove stored value — default will apply on save";

function renderPage() {
  return render(
    <ConfigDirtyProvider>
      <LlmConfigPage />
    </ConfigDirtyProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("LlmConfigPage prompt caching save transform", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
    mockGet.mockResolvedValue(STORED);
  });

  it("toggles prompt_caching_enabled → nested prompt_caching payload, flat keys absent", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/org/config", {
        prompt_caching: {
          enabled: false,
          anthropic_min_tokens: 1024,
          anthropic_cache_ttl: "5m",
        },
      });
    });
  });

  it("resets all three fields → prompt_caching: {} (clears to defaults)", async () => {
    const user = userEvent.setup();
    renderPage();

    const resetButtons = await screen.findAllByTitle(RESET_TITLE);
    expect(resetButtons).toHaveLength(3);
    for (const button of resetButtons) await user.click(button);

    await user.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/org/config", {
        prompt_caching: {},
      });
    });
  });

  it("resets only one field → null for that key, current values for the others", async () => {
    const user = userEvent.setup();
    renderPage();

    const resetButtons = await screen.findAllByTitle(RESET_TITLE);
    await user.click(resetButtons[1]); // anthropic_min_tokens

    await user.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/org/config", {
        prompt_caching: {
          enabled: true,
          anthropic_min_tokens: null,
          anthropic_cache_ttl: "5m",
        },
      });
    });
  });

  it("does not call patch when nothing changed", async () => {
    renderPage();

    await screen.findByRole("checkbox");
    expect(
      screen.queryByRole("button", { name: "Save Changes" }),
    ).not.toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});