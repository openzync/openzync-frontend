import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { useEffect, useReducer } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MemoryPage from "@/app/(dashboard)/projects/[id]/memory/page";
import { post, uploadWithBlobs, ApiError } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const { mockReplace, mockSearchParamsGet, setSearchParams, onMockReplace } =
  vi.hoisted(() => {
    // Stateful URL simulation: router.replace writes ?tab= back into the
    // search-param mock and notifies subscribers, mirroring how real Next.js
    // re-renders useSearchParams consumers after a replace.
    const params = new Map<string, string>();
    const listeners = new Set<() => void>();
    return {
      mockReplace: vi.fn((url: string) => {
        params.clear();
        for (const [k, v] of new URL(url, "http://x").searchParams) params.set(k, v);
        for (const notify of listeners) notify();
      }),
      mockSearchParamsGet: vi.fn((key: string) => params.get(key) ?? null),
      setSearchParams: (entries: Record<string, string>) => {
        params.clear();
        for (const [k, v] of Object.entries(entries)) params.set(k, v);
      },
      onMockReplace: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  });

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project-123/memory",
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => mockSearchParamsGet(key) }),
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

// The Ingest tab always sends memory ingestion through `uploadWithBlobs` —
// the endpoint only accepts multipart/form-data with a `data` field, even for
// text-only calls — and loads the session dropdown via `get`. Mock the module
// but keep the real `ApiError` class so the ingest error path renders readable
// messages instead of `[object Object]`.
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api-client")
  >("@/lib/api-client");
  return {
    ...actual,
    get: vi.fn().mockResolvedValue({
      data: [{ id: "session-1", external_id: "session-1" }],
    }),
    post: vi.fn(),
    uploadWithBlobs: vi.fn(),
  };
});

vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideMemory: () => <div>Memory Icon</div>,
}));

// jsdom lacks the PointerEvent APIs Radix Select (Default Role) relies on
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  setSearchParams({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Re-renders the page whenever the URL mock changes — the stand-in for
// Next.js re-rendering useSearchParams consumers after router.replace.
function MemoryPageHarness() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsub = onMockReplace(force);
    return () => {
      unsub();
    };
  }, []);
  return <MemoryPage />;
}

// The submit button and the Ingest tab share the accessible name "Ingest" —
// scope queries to the ingest card via its heading.
function renderIngestCard() {
  render(<MemoryPageHarness />);
  const heading = screen.getByText("Ingest Messages");
  const card = heading.closest(".card-base");
  if (!card) throw new Error("Ingest card not found");
  return within(card as HTMLElement);
}

// Session is a required field now — select it before submitting. The sessions
// fetch resolves async, so wait for the option to appear first.
async function selectSession(card: ReturnType<typeof within>, sessionId = "session-1") {
  const option = await card.findByText(sessionId);
  await userEvent.selectOptions(
    card.getByRole("combobox", { name: /Session/ }),
    option,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("MemoryPage Ingest", () => {
  it("uploads messages via uploadWithBlobs and wires EnrichmentStatus on successful ingest", async () => {
    const user = userEvent.setup();
    const card = renderIngestCard();

    vi.mocked(uploadWithBlobs).mockResolvedValue({
      status: "accepted",
      job_id: "job-1",
      episode_count: 3,
      blob_count: 2,
    });

    await user.type(
      card.getByPlaceholderText(/user: What is the capital/),
      "user: Hello there",
    );
    await selectSession(card);
    await user.click(card.getByRole("button", { name: "Ingest" }));

    expect(
      await screen.findByText("3 episodes queued for enrichment"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 files attached")).toBeInTheDocument();
    expect(screen.getByText("Job job-1")).toBeInTheDocument();
    expect(screen.getByText("Ingest accepted")).toBeInTheDocument();
    expect(screen.getByText("Ingest Successful")).toBeInTheDocument();

    expect(uploadWithBlobs).toHaveBeenCalledWith(
      "/v1/projects/project-123/memory",
      {
        messages: [{ role: "user", content: "Hello there" }],
        session_id: "session-1",
      },
      [],
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("sends text-only ingests (no files) through uploadWithBlobs with an empty file list", async () => {
    const user = userEvent.setup();
    const card = renderIngestCard();

    vi.mocked(uploadWithBlobs).mockResolvedValue({ status: "accepted" });

    await user.type(
      card.getByPlaceholderText(/user: What is the capital/),
      "user: hi{enter}assistant: hello",
    );
    await selectSession(card);
    await user.click(card.getByRole("button", { name: "Ingest" }));

    expect(await screen.findByText("Ingest Successful")).toBeInTheDocument();
    expect(uploadWithBlobs).toHaveBeenCalledWith(
      "/v1/projects/project-123/memory",
      {
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
        session_id: "session-1",
      },
      [],
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("renders a readable API validation message instead of [object Object]", async () => {
    const user = userEvent.setup();
    const card = renderIngestCard();

    vi.mocked(uploadWithBlobs).mockRejectedValue(
      new ApiError("messages.0.content: Field required", 422, {
        detail: [
          {
            loc: ["body", "messages", 0, "content"],
            msg: "Field required",
            type: "missing",
          },
        ],
      }),
    );

    await user.type(
      card.getByPlaceholderText(/user: What is the capital/),
      "user: Hello there",
    );
    await selectSession(card);
    await user.click(card.getByRole("button", { name: "Ingest" }));

    expect(
      await screen.findByText("messages.0.content: Field required"),
    ).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows a validation error on empty messages without calling the API", async () => {
    const user = userEvent.setup();
    const card = renderIngestCard();

    await selectSession(card);
    await user.click(card.getByRole("button", { name: "Ingest" }));

    expect(
      await screen.findByText("Please enter at least one message"),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("disables submit until a session is selected and offers no auto session option", async () => {
    const card = renderIngestCard();

    expect(card.getByRole("button", { name: "Ingest" })).toBeDisabled();
    expect(card.queryByText("Default session (auto)")).not.toBeInTheDocument();
    expect(
      await card.findByText(
        /Select a session — memory is ingested into an existing session only/,
      ),
    ).toBeInTheDocument();
    expect(uploadWithBlobs).not.toHaveBeenCalled();
  });
});

// ─── ?tab= URL state ──────────────────────────────────────────────────────────────

describe("MemoryPage tabs (?tab= URL state)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearchParams({});
  });

  it("defaults to the ingest tab when ?tab= is absent", () => {
    render(<MemoryPageHarness />);
    expect(screen.getByRole("tab", { name: /Ingest/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Ingest Messages")).toBeInTheDocument();
    expect(screen.queryByText("Query Context")).not.toBeInTheDocument();
  });

  it("clicking Context writes ?tab=context via router.replace (no scroll) and switches panels", async () => {
    const user = userEvent.setup();
    render(<MemoryPageHarness />);

    await user.click(screen.getByRole("tab", { name: /Context/i }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/projects/project-123/memory?tab=context",
      { scroll: false },
    );
    expect(await screen.findByText("Query Context")).toBeInTheDocument();
    expect(screen.queryByText("Ingest Messages")).not.toBeInTheDocument();
  });

  it("deep-links straight into a tab from ?tab=search", () => {
    setSearchParams({ tab: "search" });
    render(<MemoryPageHarness />);
    expect(screen.getByText("Search Memory")).toBeInTheDocument();
    expect(screen.queryByText("Ingest Messages")).not.toBeInTheDocument();
  });

  it("clamps an invalid ?tab= value back to ingest", () => {
    setSearchParams({ tab: "bogus" });
    render(<MemoryPageHarness />);
    expect(screen.getByText("Ingest Messages")).toBeInTheDocument();
    expect(screen.queryByText("Search Memory")).not.toBeInTheDocument();
  });
});
