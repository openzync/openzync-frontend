import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProjectProvider, useProject } from "@/stores/project-context";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

let mockUseParams: Record<string, string | undefined> = { id: "project-123" };

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/projects/project-123/sessions",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-client", () => ({
  get: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
    get isUnauthorized() {
      return this.status === 401;
    }
    get isNotFound() {
      return this.status === 404;
    }
    get isRateLimited() {
      return this.status === 429;
    }
    get isServerError() {
      return this.status >= 500;
    }
  },
}));

import { get } from "@/lib/api-client";

const mockProjectInfo = {
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

// ─── Test helper ──────────────────────────────────────────────────────────────────

function TestConsumer() {
  const { project, loading, error, refetch } = useProject();
  return (
    <div>
      <p data-testid="loading">{loading ? "true" : "false"}</p>
      <p data-testid="error">{error ?? "none"}</p>
      <p data-testid="project-name">{project?.name ?? "null"}</p>
      <button onClick={refetch} data-testid="refetch-btn">
        Refetch
      </button>
    </div>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("ProjectProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially", () => {
    (get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>,
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(screen.getByTestId("error")).toHaveTextContent("none");
    expect(screen.getByTestId("project-name")).toHaveTextContent("null");
  });

  it("displays project data when loaded successfully", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue(mockProjectInfo);

    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("none");
    expect(screen.getByTestId("project-name")).toHaveTextContent(
      "Test Project",
    );
  });

  it("sets error when project is not found (404)", async () => {
    const { ApiError } = await import("@/lib/api-client");
    (get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError("Project not found", 404, null),
    );

    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Project not found",
      );
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("project-name")).toHaveTextContent("null");
  });

  it("sets generic error on other API failures", async () => {
    const { ApiError } = await import("@/lib/api-client");
    (get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError("Server error", 500, null),
    );

    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Server error");
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("sets generic error on network failure", async () => {
    (get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Failed to load project",
      );
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("sets loading false and project null when no projectId from params", async () => {
    mockUseParams = {};
    render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    expect(screen.getByTestId("project-name")).toHaveTextContent("null");
    mockUseParams = { id: "project-123" }; // reset
  });
});

describe("useProject", () => {
  it("throws when used outside provider (fail loud, like user-context)", () => {
    // Suppress console.error for the expected render error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useProject must be used within a ProjectProvider",
    );
    spy.mockRestore();
  });
});
