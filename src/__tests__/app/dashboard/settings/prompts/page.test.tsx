import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PromptsPage from "@/app/(dashboard)/settings/prompts/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPost, mockPut, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings/prompts",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: mockGet,
  post: mockPost,
  put: mockPut,
  del: mockDel,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEMPLATE_NAME = "fact_extraction";

const TEMPLATE_SUMMARY = {
  name: TEMPLATE_NAME,
  version: 2,
  is_customised: true,
  description: "Extract facts from messages",
  type: "fact_extraction",
  is_default_for_type: true,
  updated_at: "2025-01-01T00:00:00Z",
};

/** Neither version is the system default — that is what used to reveal the promote button. */
const VERSIONS = {
  name: TEMPLATE_NAME,
  current_version: 2,
  versions: [
    {
      name: TEMPLATE_NAME,
      version: 2,
      template_text: "v2 body",
      description: "current",
      type: "fact_extraction",
      is_active: true,
      is_system_default: false,
    },
    {
      name: TEMPLATE_NAME,
      version: 1,
      template_text: "v1 body",
      description: "older",
      type: "fact_extraction",
      is_active: false,
      is_system_default: false,
    },
  ],
};

function renderPage() {
  return render(<PromptsPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("PromptsPage — version history actions", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockDel.mockReset();

    mockGet.mockImplementation((path: string) => {
      if (path === `/admin/org/prompts/${TEMPLATE_NAME}/versions`) {
        return Promise.resolve(VERSIONS);
      }
      if (path.startsWith("/admin/org/prompts?")) {
        return Promise.resolve({ data: [TEMPLATE_SUMMARY] });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({});
    mockPut.mockResolvedValue({});
    mockDel.mockResolvedValue({});
  });

  it("no longer offers the promote ('Set as System Default') affordance", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTitle("View version history"));

    // Wait for the version list to load, then select the older version —
    // the one the old code would have offered to promote.
    const v1 = await screen.findByRole("button", { name: /^v1/ });
    await user.click(v1);

    // The backend deleted the promote route, so the button was a permanent
    // 404 — it must be gone, together with its confirmation step.
    expect(
      screen.queryByRole("button", { name: /set as system default/i }),
    ).toBeNull();
    expect(screen.queryByText(/set as global default/i)).toBeNull();
    expect(
      mockPost.mock.calls.filter(([url]) =>
        String(url).includes("/promote/"),
      ),
    ).toEqual([]);
  }, 20_000);

  it("still offers the rollback affordance and posts the rollback", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTitle("View version history"));

    const v1 = await screen.findByRole("button", { name: /^v1/ });
    await user.click(v1);

    const rollback = await screen.findByRole("button", { name: /rollback to v1/i });
    expect(rollback).toBeInTheDocument();

    await user.click(rollback);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        `/admin/org/prompts/${TEMPLATE_NAME}/rollback/1`,
      );
    });
  }, 20_000);
});
