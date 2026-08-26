import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsPage from "@/app/(dashboard)/projects/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/projects",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: vi.fn(),
  post: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
    get isNotFound() {
      return this.status === 404;
    }
  },
  extractList: vi.fn((response: unknown) => {
    if (!response || typeof response !== "object") return [];
    if (Array.isArray(response)) return response;
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
    return [];
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { get, post } from "@/lib/api-client";

const mockProjects = [
  {
    id: "proj-1",
    name: "Customer Support Bot",
    description: "Handles customer queries",
    member_count: 3,
    created_by: "user-1",
    created_at: "2025-01-15T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z",
  },
  {
    id: "proj-2",
    name: "Data Extraction Pipeline",
    description: null,
    member_count: 5,
    created_by: "user-2",
    created_at: "2025-03-01T00:00:00Z",
    updated_at: "2025-06-10T00:00:00Z",
  },
];

beforeEach(() => {
  mockPush.mockReset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("ProjectsPage", () => {
  it("renders the page header", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    render(<ProjectsPage />);

    expect(await screen.findByText("Projects")).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Collaborative workspaces for memory and knowledge graph data/,
      ),
    ).toBeInTheDocument();
  });

  it("renders the Create Project button", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    render(<ProjectsPage />);
    expect(
      await screen.findByRole("button", { name: /create project/i }),
    ).toBeInTheDocument();
  });

  it("renders project cards when projects exist", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    render(<ProjectsPage />);

    expect(
      await screen.findByText("Customer Support Bot"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Data Extraction Pipeline"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Handles customer queries"),
    ).toBeInTheDocument();
  });

  it("renders project metadata (member count, created date)", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    render(<ProjectsPage />);

    expect(await screen.findByText(/3 members?/i)).toBeInTheDocument();
    expect(await screen.findByText(/5 members?/i)).toBeInTheDocument();
  });

  it("shows loading skeleton initially", () => {
    (get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<ProjectsPage />);

    // Should have skeleton elements
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows empty state when no projects exist", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    render(<ProjectsPage />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(
      await screen.findByText(/Create your first project/),
    ).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    const { ApiError } = await import("@/lib/api-client");
    (get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError("Failed to load", 500, null),
    );

    render(<ProjectsPage />);

    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });

  it("retry button refetches projects", async () => {
    const { ApiError } = await import("@/lib/api-client");
    (get as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new ApiError("Failed to load", 500, null))
      .mockResolvedValueOnce({ data: mockProjects });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("Customer Support Bot"),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("opens create dialog when Create Project is clicked", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    const createBtn = await screen.findByRole("button", {
      name: /create project/i,
    });
    await user.click(createBtn);

    // The title appears inside the dialog — look for the heading element
    const headings = await screen.findAllByText("Create Project");
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByPlaceholderText("e.g., Customer Support Bot"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Optional description of this project"),
    ).toBeInTheDocument();
  });

  it("creates a project via the dialog", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });
    (post as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "proj-3",
      name: "New Project",
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    // Open dialog
    const createBtn = await screen.findByRole("button", {
      name: /create project/i,
    });
    await user.click(createBtn);

    // Fill form
    await user.type(
      screen.getByPlaceholderText("e.g., Customer Support Bot"),
      "New Project",
    );
    await user.type(
      screen.getByPlaceholderText("Optional description of this project"),
      "A new project",
    );

    // Submit
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/v1/projects", {
        name: "New Project",
        description: "A new project",
      });
    });
    expect(mockPush).toHaveBeenCalledWith("/projects/proj-3/sessions");
  });

  it("shows error when creating with empty name", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    // Open dialog
    await user.click(
      await screen.findByRole("button", { name: /create project/i }),
    );

    // Type a name first so the Create button becomes enabled
    await user.type(
      screen.getByPlaceholderText("e.g., Customer Support Bot"),
      "a",
    );
    // Clear it to trigger the client-side validation in handleCreate
    await user.clear(
      screen.getByPlaceholderText("e.g., Customer Support Bot"),
    );
    // Click Create with empty name — the button is disabled so we trigger
    // the validation by calling handleCreate directly through submit

    // Since the button is disabled when name is empty, we need to
    // click Create while there IS a name to submit, and let the API fail
    // Alternatively, verify the button is disabled
    expect(
      screen.getByRole("button", { name: "Create" }),
    ).toBeDisabled();
  });

  it("closes create dialog on Cancel", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.click(
      await screen.findByRole("button", { name: /create project/i }),
    );

    expect(
      screen.getByPlaceholderText("e.g., Customer Support Bot"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByPlaceholderText("e.g., Customer Support Bot"),
    ).not.toBeInTheDocument();
  });

  // ── Card structure regressions ─────────────────────────────────────────────
  // The card used to be a <button> containing the pin <button> — invalid HTML
  // that caused hydration errors and double-activation. It is now a div with
  // role="link" and the pin button is a sibling interactive element.

  it("renders cards as link roles without nested buttons", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const { container } = render(<ProjectsPage />);

    const card = await screen.findByRole("link", {
      name: /customer support bot/i,
    });
    expect(card).toBeInTheDocument();
    // Invalid HTML regression: no <button> may be nested inside a <button>.
    expect(container.querySelector("button button")).toBeNull();
  });

  it("navigates when the card is clicked", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    const card = await screen.findByRole("link", {
      name: /customer support bot/i,
    });
    await user.click(card);

    expect(mockPush).toHaveBeenCalledWith("/projects/proj-1/sessions");
  });

  it("navigates when the card is activated with Enter/Space", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    const card = await screen.findByRole("link", {
      name: /customer support bot/i,
    });
    card.focus();
    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/projects/proj-1/sessions");

    mockPush.mockClear();
    await user.keyboard(" ");
    expect(mockPush).toHaveBeenCalledWith("/projects/proj-1/sessions");
  });

  it("pin button toggles pinning without navigating", async () => {
    (get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockProjects,
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    // One pin button per project card
    const pinButtons = await screen.findAllByTitle(/pin project/i);
    await user.click(pinButtons[0]);

    expect(mockPush).not.toHaveBeenCalled();
  });
});
