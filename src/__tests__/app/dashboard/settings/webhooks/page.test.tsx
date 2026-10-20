import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WebhooksPage from "@/app/(dashboard)/settings/webhooks/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPost, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings/webhooks",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: mockGet,
  post: mockPost,
  del: mockDel,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface Endpoint {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_delivery_at: string | null;
  created_at: string;
  updated_at: string;
}

const HOOK_A: Endpoint = {
  id: "w-1",
  organization_id: "org-1",
  name: "Hook A",
  url: "https://hooks.example.com/a",
  events: ["session.created"],
  is_active: true,
  last_delivery_at: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const HOOK_B: Endpoint = {
  id: "w-2",
  organization_id: "org-1",
  name: "Hook B",
  url: "https://hooks.example.com/b",
  events: ["fact.extracted"],
  is_active: true,
  last_delivery_at: null,
  created_at: "2025-01-02T00:00:00Z",
  updated_at: "2025-01-02T00:00:00Z",
};

const HOOK_C: Endpoint = {
  id: "w-3",
  organization_id: "org-1",
  name: "Hook C",
  url: "https://hooks.example.com/c",
  events: ["message.added"],
  is_active: true,
  last_delivery_at: null,
  created_at: "2025-02-01T00:00:00Z",
  updated_at: "2025-02-01T00:00:00Z",
};

const ENDPOINTS_URL = "/v1/admin/webhooks?sort_by=created_at&sort_dir=desc";

/** The server's view of the endpoint list — mutated by the test as the API evolves. */
let serverEndpoints: Endpoint[];

function renderPage() {
  return render(<WebhooksPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("WebhooksPage — removal does not freeze the list", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDel.mockReset();
    serverEndpoints = [HOOK_A, HOOK_B];

    mockGet.mockImplementation((path: string) => {
      if (path === ENDPOINTS_URL) return Promise.resolve({ data: serverEndpoints });
      if (path === "/v1/admin/webhooks/events") {
        return Promise.resolve({
          data: {
            Session: [
              { type: "session.created", label: "Session Created", category: "Session", description: "" },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({
      id: "w-3",
      name: "Hook C",
      url: "https://hooks.example.com/c",
      secret: "whsec_test",
      message: "created",
    });
    mockDel.mockResolvedValue(undefined);
  });

  it("shows an endpoint added after a removal once the server refetches", async () => {
    // delay: null — the full suite runs ~60 files in parallel and the
    // default inter-key delay pushes this file past vitest's 5s testTimeout.
    const user = userEvent.setup({ delay: null });
    renderPage();
    // ── Baseline: both endpoints are listed.
    expect(await screen.findByText("Hook A")).toBeInTheDocument();
    expect(screen.getByText("Hook B")).toBeInTheDocument();

    // ── Remove Hook A. The DELETE returns no body, so the row disappears
    //    locally — but the removal must NOT freeze the list.
    const deleteButtons = screen.getAllByTitle("Delete endpoint");
    await user.click(deleteButtons[0]);
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Hook A")).not.toBeInTheDocument();
    });
    expect(mockDel).toHaveBeenCalledWith("/v1/admin/webhooks/w-1");
    expect(screen.getByText("Hook B")).toBeInTheDocument();

    // ── The server now has a third endpoint.
    serverEndpoints = [HOOK_A, HOOK_B, HOOK_C];

    // ── Trigger a server refetch: creating an endpoint refetches the list
    //    when the create dialog closes.
    const createButton = screen.getByRole("button", { name: "Create Endpoint" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    const dialog = await screen.findByRole("dialog");
    // Required fields carry a "(required)" suffix in their label text.
    // fireEvent.change instead of user.type — one event per field instead of
    // one per character, which keeps the test well inside the timeout when
    // the whole suite runs in parallel.
    fireEvent.change(within(dialog).getByLabelText(/^Endpoint Name/), {
      target: { value: "Hook C" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Endpoint URL/), {
      target: { value: "https://hooks.example.com/c" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Create Endpoint" }));

    // The create dialog shows the secret, then closes → refetch.
    const doneButton = await screen.findByRole("button", { name: "Done" });
    await user.click(doneButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/v1/admin/webhooks",
        expect.objectContaining({ name: "Hook C" }),
      );
    });

    // The refetched server data must win: the newly added endpoint shows up…
    expect(await screen.findByText("Hook C")).toBeInTheDocument();
    // …while the locally-removed endpoint stays hidden.
    expect(screen.queryByText("Hook A")).not.toBeInTheDocument();
  }, 30_000);
});
