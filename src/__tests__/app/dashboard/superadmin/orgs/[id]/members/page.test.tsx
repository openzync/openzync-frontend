import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import OrgMembersAdminPage from "@/app/(dashboard)/superadmin/orgs/[id]/members/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  // The org id comes from the route segment — the whole point of the test is
  // that the request is scoped to THAT org, not to the requester's own.
  useParams: () => ({ id: "org-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/superadmin/orgs/org-1/members",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
    get isNotFound(): boolean {
      return this.status === 404;
    }
  }
  return {
    get: mockGet,
    patch: mockPatch,
    ApiError,
    apiErrorMessage: (err: unknown, fallback: string) =>
      err instanceof Error && err.message ? err.message : fallback,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MEMBERS = {
  data: [
    { id: "u-1", name: "Ada Lovelace", email: "ada@acme.com", role: "admin", is_active: true },
    { id: "u-2", name: null, email: "grace@acme.com", role: "member", is_active: true },
  ],
  total: 2,
  page: 1,
  limit: 200,
};

/** Every path the mocked `get` was called with. */
function getPaths(): string[] {
  return mockGet.mock.calls.map(([path]) => path as string);
}

function renderPage() {
  return render(<OrgMembersAdminPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("OrgMembersAdminPage — member list source", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
    mockGet.mockResolvedValue(MEMBERS);
  });

  it("requests the org-scoped superadmin members endpoint, not /v1/users", async () => {
    renderPage();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();

    // The org in the URL must be the org the list comes from.
    // Sorted by name/asc: `SystemMemberListItem` has no `created_at`, so
    // sorting by it would order the list by a value the table never shows.
    expect(getPaths()).toContain(
      "/admin/system/orgs/org-1/members?limit=200&sort_by=name&sort_dir=asc",
    );

    // GET /v1/users is scoped to the REQUESTER's own org — the list must
    // never come from it.
    expect(getPaths().filter((p) => p.startsWith("/v1/users"))).toEqual([]);
  });

  it("never falls back to GET /v1/users (scoped to the requester's own org)", async () => {
    renderPage();

    await screen.findByText("Ada Lovelace");

    // GET /v1/users is scoped to the REQUESTER's org — using it here showed
    // the wrong tenant's members. Assert it is never called at all.
    const usersCalls = getPaths().filter((p) => p.startsWith("/v1/users"));
    expect(usersCalls).toEqual([]);
  });

  it("renders the members returned by the org-scoped endpoint", async () => {
    renderPage();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@acme.com")).toBeInTheDocument();
    // A member with no name still renders their email — email is non-null
    // by contract, so exactly one em-dash placeholder (the missing name).
    expect(screen.getByText("grace@acme.com")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
