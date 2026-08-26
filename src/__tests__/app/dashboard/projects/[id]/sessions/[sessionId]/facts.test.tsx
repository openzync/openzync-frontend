import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionFactsPage from "@/app/(dashboard)/projects/[id]/sessions/[sessionId]/facts/page";
import { get, post } from "@/lib/api-client";
import { toast } from "sonner";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-123", sessionId: "session-1" }),
}));

const mockProject = {
  id: "project-123",
  name: "Test Project",
  description: "A test project",
  metadata: {},
  is_archived: false,
  member_count: 3,
  created_by: "user-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
};

vi.mock("@/stores/project-context", () => ({
  useProject: () => ({
    project: mockProject,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Keep the real ApiError class so the page's `instanceof ApiError` checks work.
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api-client")
  >("@/lib/api-client");
  return {
    ...actual,
    get: vi.fn(),
    post: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/(dashboard)/projects/[id]/sessions/[sessionId]/tabs", () => ({
  default: () => <div>Session Tabs</div>,
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideData: () => <div>Data Icon</div>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fact = {
  id: "fact-1",
  content: "Paris is the capital of France",
  subject: "Paris",
  predicate: "is capital of",
  object: "France",
  confidence: 0.95,
  created_at: "2025-01-01T00:00:00Z",
  valid_to: null,
  invalid_at: null,
};

const factsResponse = {
  data: [fact],
  next_cursor: null,
  has_more: false,
};

const historyResponse = {
  fact,
  events: [
    {
      id: "evt-1",
      old_fact_id: "fact-1",
      new_fact_id: "fact-2",
      kind: "superseded" as const,
      reason: "Replaced by newer extraction",
      at_time: "2025-01-02T00:00:00Z",
      source_episode_id: "ep-1",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(get).mockImplementation((path: string) => {
    if (path.includes("/history")) return Promise.resolve(historyResponse);
    return Promise.resolve(factsResponse);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("SessionFactsPage", () => {
  // Timeout raised deliberately (last resort): this is the longest sequential
  // user-event chain in the suite. When all 39 files run in parallel workers on
  // a saturated box, each dispatch stretches ~30x wall-clock (measured: one
  // click took 2.7s vs ~80ms in isolation) — not a logic race, pure scheduler
  // starvation. The chain is already minimized (delay: null, single change
  // event instead of per-key typing); the explicit ceiling absorbs the tail.
  it(
    "retracts a fact with a reason, then refetches the list",
    async () => {
      const user = userEvent.setup({ delay: null });
      render(<SessionFactsPage />);

      expect(
        await screen.findByText("Paris is the capital of France"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Retract" }));

      const dialog = await screen.findByRole("alertdialog");
      expect(
        within(dialog).getByRole("heading", { name: "Retract fact" }),
      ).toBeInTheDocument();

      fireEvent.change(
        within(dialog).getByPlaceholderText("Reason (optional)"),
        { target: { value: "duplicate fact" } },
      );
      await user.click(within(dialog).getByRole("button", { name: "Retract" }));

      // The confirm handler calls post() synchronously before its first await,
      // so the call is already recorded once userEvent's act() scope settles —
      // no polling needed.
      expect(post).toHaveBeenCalledWith(
        "/v1/projects/project-123/facts/fact-1/retract",
        { reason: "duplicate fact" },
      );
      // Drain the post→toast→refetch microtask chain deterministically instead
      // of racing waitFor's wall-clock budget under parallel-worker CPU load.
      await act(async () => {});
      await act(async () => {});

      // The list is refetched after a successful retract.
      expect(get).toHaveBeenCalledTimes(2);
      expect(get).toHaveBeenNthCalledWith(
        2,
        "/v1/projects/project-123/sessions/session-1/facts?limit=50",
      );
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Fact retracted");
    },
    15_000,
  );

  it("opens the history dialog and renders event kind and reason", async () => {
    const user = userEvent.setup();
    render(<SessionFactsPage />);

    expect(
      await screen.findByText("Paris is the capital of France"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "History" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Fact history" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Superseded")).toBeInTheDocument();
    expect(screen.getByText("Replaced by newer extraction")).toBeInTheDocument();
    expect(screen.getByText("Replaced by fact fact-2")).toBeInTheDocument();
  });
});