import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SessionDetailPage from "@/app/(dashboard)/projects/[id]/sessions/[sessionId]/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ sessionId: "s-1" }),
  usePathname: () => "/projects/p-1/sessions/s-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/stores/project-context", () => ({
  useProject: () => ({
    project: { id: "p-1", name: "Test Project" },
    loading: false,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  get: vi.fn().mockImplementation((path: string) => {
    if (path === "/v1/projects/p-1/sessions/s-1") {
      return Promise.resolve({
        id: "s-1",
        user_id: "u-1",
        external_id: "session-ext-1",
        is_active: true,
        message_count: 2,
        fact_count: 0,
        pending_enrichment_count: 0,
        observation_count: 0,
        created_at: "2025-01-01T00:00:00Z",
      });
    }
    if (path === "/v1/projects/p-1/sessions/s-1/messages?limit=100") {
      return Promise.resolve({
        data: [
          { id: "m-1", role: "user", content: "Hello from the user", created_at: "2025-01-01T00:00:01Z" },
          { id: "m-2", role: "assistant", content: "Hi, how can I help?", created_at: "2025-01-01T00:00:02Z" },
        ],
      });
    }
    return Promise.resolve({});
  }),
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title }: { title: string }) => <div>{title}</div>,
  GuideConversation: () => <div>Guide Icon</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("SessionDetailPage", () => {
  // Regression: the landing view used to be a dead-end
  // "Select a tab above to view session data." placeholder.
  it("renders messages inline by default instead of the dead-end placeholder", async () => {
    render(<SessionDetailPage />);

    expect(await screen.findByText("Hello from the user")).toBeInTheDocument();
    expect(screen.getByText("Hi, how can I help?")).toBeInTheDocument();
    expect(
      screen.queryByText(/Select a tab above to view session data/i),
    ).not.toBeInTheDocument();
  });

  it("renders the shared tab bar; on the landing no subtab is marked current", async () => {
    render(<SessionDetailPage />);

    // Landing path /sessions/<id> matches no subtab → nothing is aria-current.
    const messagesTab = await screen.findByRole("link", { name: "Messages" });
    expect(messagesTab).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Facts" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Observations" })).toHaveAttribute(
      "href",
      "/projects/p-1/sessions/s-1/observations",
    );
  });
});
