import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import UserDetailPage from "@/app/(dashboard)/users/[id]/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "u-123" }),
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    user: { id: "me-1", email: "admin@acme.com", role: "admin", permissions: [] },
    can: () => true,
    loading: false,
  }),
  ALL_PERMISSIONS: [],
}));

vi.mock("@/lib/api-client", () => ({
  get: vi.fn().mockImplementation((path: string) => {
    if (path === "/v1/users/u-123") {
      return Promise.resolve({
        id: "u-123",
        external_id: "ext-abc",
        name: "Test User",
        email: "test@example.com",
        is_active: true,
        created_at: "2025-01-01T00:00:00Z",
        role: "member",
        permissions: [],
        message_count: 0,
        fact_count: 0,
        session_count: 0,
      });
    }
    return Promise.resolve(null);
  }),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
    get isNotFound() {
      return this.status === 404;
    }
    get isForbidden() {
      return this.status === 403;
    }
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  mockPush.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("UserDetailPage", () => {
  it("renders the user profile", async () => {
    render(<UserDetailPage />);
    expect(await screen.findAllByText("ext-abc").then((els) => els.length)).toBeGreaterThan(0);
  });

  // Regression: the page used to link to /sessions?userId=<id>, a route that
  // does not exist (only project-scoped session lists exist) — a hard 404.
  it("does not link to the nonexistent org-level sessions route", async () => {
    const { container } = render(<UserDetailPage />);
    await screen.findAllByText("ext-abc");

    expect(container.querySelectorAll('a[href*="/sessions?userId"]').length).toBe(0);
    expect(screen.queryByRole("link", { name: /^sessions$/i })).not.toBeInTheDocument();
  });
});
