import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuperadminOrgsPage from "@/app/(dashboard)/superadmin/orgs/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
    get isForbidden(): boolean {
      return this.status === 403;
    }
  }
  return {
    get: mockGet,
    post: mockPost,
    ApiError,
    apiErrorMessage: (err: unknown, fallback: string) =>
      err instanceof ApiError && err.isForbidden ? "Admin access required" : fallback,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils", () => ({
  formatDate: () => "Jun 1, 2025",
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/shared/error-state", () => ({
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: () => <div>empty</div>,
}));

vi.mock("@/components/shared/skeleton", () => ({
  TableSkeleton: () => null,
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    confirmLabel,
    onConfirm,
    loading,
  }: {
    open: boolean;
    confirmLabel: string;
    onConfirm: () => void;
    loading?: boolean;
  }) => (open ? <button onClick={onConfirm} disabled={loading}>{confirmLabel}</button> : null),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const APPROVED = { id: "o-1", name: "Acme Corp", status: "approved", created_at: "2025-06-01T00:00:00Z" };
const PENDING_ORG = { id: "o-2", name: "Pending Labs", status: "pending", created_at: "2025-06-02T00:00:00Z" };
const REJECTED = { id: "o-3", name: "Old Co", status: "rejected", created_at: "2025-06-03T00:00:00Z" };

function mockOrgsList(orgs: typeof APPROVED[], total = orgs.length, page = 1, limit = 50) {
  mockGet.mockResolvedValue({ data: orgs, total, page, limit });
}

function renderPage() {
  return render(<SuperadminOrgsPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("SuperadminOrgsPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("lists all orgs with status badges", async () => {
    mockOrgsList([APPROVED, PENDING_ORG, REJECTED]);
    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Pending Labs")).toBeInTheDocument();
    expect(screen.getByText("Old Co")).toBeInTheDocument();

    // Status badges — one of each.
    expect(screen.getAllByText("Approved")).toHaveLength(1);
    expect(screen.getAllByText("Pending")).toHaveLength(1);
    expect(screen.getAllByText("Rejected")).toHaveLength(1);
  });

  it("shows Approve/Reject actions only on pending rows", async () => {
    mockOrgsList([APPROVED, PENDING_ORG, REJECTED]);
    renderPage();

    await screen.findByText("Pending Labs");
    expect(screen.getByLabelText("Approve Pending Labs")).toBeInTheDocument();
    expect(screen.getByLabelText("Reject Pending Labs")).toBeInTheDocument();
    expect(screen.queryByLabelText("Approve Acme Corp")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reject Old Co")).not.toBeInTheDocument();
  });

  it("POSTs the approve action after confirmation", async () => {
    const user = userEvent.setup();
    mockOrgsList([APPROVED, PENDING_ORG, REJECTED]);
    mockPost.mockResolvedValue({ ...PENDING_ORG, status: "approved" });
    renderPage();

    await user.click(await screen.findByLabelText("Approve Pending Labs"));
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/system/orgs/o-2/approve");
    });
  });

  it("POSTs the reject action after confirmation", async () => {
    const user = userEvent.setup();
    mockOrgsList([APPROVED, PENDING_ORG, REJECTED]);
    mockPost.mockResolvedValue({ ...PENDING_ORG, status: "rejected" });
    renderPage();

    await user.click(await screen.findByLabelText("Reject Pending Labs"));
    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/system/orgs/o-2/reject");
    });
  });

  it("creates an org through the dialog and POSTs /admin/organizations", async () => {
    const user = userEvent.setup();
    mockOrgsList([APPROVED, PENDING_ORG, REJECTED]);
    mockPost.mockResolvedValue({ organization_id: "o-4", organization_name: "New Org" });
    renderPage();

    // Header button opens the dialog (a second "Create Organization" button lives in the dialog footer).
    await user.click(screen.getByRole("button", { name: "Create Organization" }));
    await user.type(screen.getByPlaceholderText("e.g. Acme Corp"), "New Org");
    const dialogButtons = screen.getAllByRole("button", { name: "Create Organization" });
    await user.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/organizations", { name: "New Org" });
    });
  });

  it("renders the error state with retry when the list fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("Failed to load organizations"));
    renderPage();

    expect(await screen.findByText("Failed to load organizations")).toBeInTheDocument();
  });

  it("fetches page 1 with the backend page/limit contract and hides load-more when total is on one page", async () => {
    mockOrgsList([APPROVED, PENDING_ORG, REJECTED], 3);
    renderPage();

    await screen.findByText("Acme Corp");
    expect(mockGet).toHaveBeenCalledWith("/admin/system/orgs?page=1&limit=50");
    expect(screen.queryByRole("button", { name: /Load More/i })).not.toBeInTheDocument();
  });

  it("loads page 2 on demand and hides the button once all orgs are fetched", async () => {
    const user = userEvent.setup();
    // hasMore derives from the response total, not the rendered row count —
    // keep fixtures small so the test stays fast under parallel load.
    const page1 = [APPROVED, PENDING_ORG, REJECTED, { ...APPROVED, id: "o-4", name: "Org 4" }];
    const page2 = [{ ...APPROVED, id: "o-5", name: "Tail Org" }];
    mockGet.mockResolvedValueOnce({ data: page1, total: 51, page: 1, limit: 50 });
    mockGet.mockResolvedValueOnce({ data: page2, total: 51, page: 2, limit: 50 });

    renderPage();
    await screen.findByText("Org 4");
    expect(screen.getByRole("button", { name: /Load More/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Load More/i }));

    expect(await screen.findByText("Tail Org")).toBeInTheDocument();
    expect(mockGet).toHaveBeenLastCalledWith("/admin/system/orgs?page=2&limit=50");
    expect(screen.queryByRole("button", { name: /Load More/i })).not.toBeInTheDocument();
  });
});
