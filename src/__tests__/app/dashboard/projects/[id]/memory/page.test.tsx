import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MemoryPage from "@/app/(dashboard)/projects/[id]/memory/page";
import { post, uploadWithBlobs, ApiError } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

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
    get: vi.fn().mockResolvedValue({ data: [] }),
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The submit button and the Ingest tab share the accessible name "Ingest" —
// scope queries to the ingest card via its heading.
function renderIngestCard() {
  render(<MemoryPage />);
  const heading = screen.getByText("Ingest Messages");
  const card = heading.closest(".card-base");
  if (!card) throw new Error("Ingest card not found");
  return within(card as HTMLElement);
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
      { messages: [{ role: "user", content: "Hello there" }] },
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
    await user.click(card.getByRole("button", { name: "Ingest" }));

    expect(await screen.findByText("Ingest Successful")).toBeInTheDocument();
    expect(uploadWithBlobs).toHaveBeenCalledWith(
      "/v1/projects/project-123/memory",
      {
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
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

    await user.click(card.getByRole("button", { name: "Ingest" }));

    expect(
      await screen.findByText("Please enter at least one message"),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
