import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionMessages } from "@/app/(dashboard)/projects/[id]/sessions/[sessionId]/session-messages";
import { get } from "@/lib/api-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p-1", sessionId: "s-1" }),
}));

vi.mock("@/stores/project-context", () => ({
  useProject: () => ({
    project: { id: "p-1", name: "Test Project" },
    loading: false,
  }),
}));

// Keep the real ApiError class so fetchOptional's 404 handling stays intact.
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>(
    "@/lib/api-client",
  );
  return {
    ...actual,
    get: vi.fn(),
    getMyConfig: vi.fn().mockResolvedValue({ effective: { enrichment: {} } }),
  };
});

const MESSAGE = {
  id: "m-1",
  role: "user",
  content: "Hello from the user",
  sequence_number: 0,
  token_count: 3,
  enrichment_status: 63,
  created_at: "2025-01-01T00:00:01Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrollIntoView — the auto-scroll-on-load timer needs it.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(get).mockImplementation((path: string) => {
    if (path.includes("/messages")) {
      return Promise.resolve({ data: [MESSAGE], next_cursor: null, has_more: false });
    }
    if (path.includes("/facts")) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({});
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("SessionMessages episode expand", () => {
  it("requests per-episode facts from the session-scoped URL (regression: never the project-scoped /facts)", async () => {
    const user = userEvent.setup();
    render(<SessionMessages sessionId="s-1" />);

    expect(await screen.findByText("Hello from the user")).toBeInTheDocument();

    // Expand the episode via its enrichment badge.
    await user.click(screen.getByRole("button", { name: /Enrichment details/ }));

    const factsCalls = vi
      .mocked(get)
      .mock.calls.map(([path]) => String(path))
      .filter((path) => path.includes("/facts"));

    expect(factsCalls).toContain(
      "/v1/projects/p-1/sessions/s-1/facts?episode_id=m-1&limit=50",
    );
    // Project-scoped facts (no /sessions/ segment) must never be called.
    expect(
      factsCalls.some((path) => /\/v1\/projects\/p-1\/facts/.test(path)),
    ).toBe(false);
  });
});
