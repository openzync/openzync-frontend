import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionDetailPage from "@/app/(dashboard)/projects/[id]/sessions/[sessionId]/page";
import SessionTabs from "@/app/(dashboard)/projects/[id]/sessions/[sessionId]/tabs";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p-1", sessionId: "s-1" }),
  usePathname: () => "/projects/p-1/sessions/s-1",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
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
    // The landing page renders previews, not full tables — messages preview
    // the last 5 messages.
    if (path === "/v1/projects/p-1/sessions/s-1/messages?limit=5") {
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

  // The tab bar moved to the [sessionId] layout (it owns the header + tabs
  // above every child page), so the landing page renders no tabs of its own.
  it("no longer renders its own tab bar — the [sessionId] layout owns it", async () => {
    render(<SessionDetailPage />);

    expect(await screen.findByText("Hello from the user")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Messages" })).not.toBeInTheDocument();
  });

  // Covers the shared tab bar contract the landing route depends on: the
  // layout resolves the bare path to the "overview" tab, and every subtab
  // routes to its artifact path.
  it("marks the Overview tab current on the bare session path and routes subtab clicks", async () => {
    const user = userEvent.setup();
    render(<SessionTabs sessionId="s-1" activeTab="overview" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Overview",
      "Messages",
      "Facts",
      "Graph",
      "Classifications",
      "Extractions",
      "Observations",
    ]);

    // Landing = the overview tab, and only that one.
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Messages" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Facts" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    // Subtab clicks push the artifact path (previously asserted as hrefs).
    await user.click(screen.getByRole("tab", { name: "Observations" }));
    expect(mockPush).toHaveBeenCalledWith(
      "/projects/p-1/sessions/s-1/observations",
    );

    // Overview's href is "" — from any subtab it routes to the bare path.
    // (On the landing itself the tab is already current, so Radix fires no
    // change event for a re-click.)
    const { rerender } = render(<SessionTabs sessionId="s-1" activeTab="overview" />);
    rerender(<SessionTabs sessionId="s-1" activeTab="messages" />);
    const overviewTabs = screen.getAllByRole("tab", { name: "Overview" });
    await user.click(overviewTabs[overviewTabs.length - 1]);
    expect(mockPush).toHaveBeenLastCalledWith("/projects/p-1/sessions/s-1");
  });
});
