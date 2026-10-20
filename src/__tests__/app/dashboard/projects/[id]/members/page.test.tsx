import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectMembersPage from "@/app/(dashboard)/projects/[id]/members/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockGet, mockPost, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/projects/p-1/members",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/stores/project-context", () => ({
  useProject: () => ({
    project: {
      id: "p-1",
      name: "Acme",
      description: null,
      metadata: {},
      is_archived: false,
      member_count: 2,
      created_by: "u-1",
      created_at: "2025-01-01T00:00:00Z",
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    user: { id: "u-1", email: "ada@acme.com", name: "Ada", role: "admin", permissions: [] },
    role: "admin",
    isAdmin: true,
    isSuperadmin: false,
    can: () => true,
    loading: false,
  }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: mockGet,
  post: mockPost,
  del: mockDel,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
  user: { id: string; external_id: string; name: string | null; email: string | null } | null;
}

const ADA: MemberRow = {
  id: "m-1",
  user_id: "u-a",
  role: "member",
  created_at: "2025-01-01T00:00:00Z",
  user: { id: "u-a", external_id: "ada", name: "Ada Lovelace", email: "ada@acme.com" },
};

const OWNER: MemberRow = {
  id: "m-2",
  user_id: "u-b",
  role: "owner",
  created_at: "2025-01-02T00:00:00Z",
  user: { id: "u-b", external_id: "bob", name: "Bob Stone", email: "bob@acme.com" },
};

const CAROL: MemberRow = {
  id: "m-3",
  user_id: "u-c",
  role: "member",
  created_at: "2025-02-01T00:00:00Z",
  user: { id: "u-c", external_id: "carol", name: "Carol Jones", email: "carol@acme.com" },
};

const MEMBERS_URL = "/v1/projects/p-1/members?sort_by=created_at&sort_dir=asc";

/** The server's view of the member list — mutated by the test as the API evolves. */
let serverMembers: MemberRow[];

function renderPage() {
  return render(<ProjectMembersPage />);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("ProjectMembersPage — removal does not freeze the list", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDel.mockReset();
    serverMembers = [ADA, OWNER];

    mockGet.mockImplementation((path: string) => {
      if (path === MEMBERS_URL) return Promise.resolve({ data: serverMembers });
      if (path === "/v1/users?limit=200") {
        return Promise.resolve({
          data: [{ id: "u-c", email: "carol@acme.com", name: "Carol Jones" }],
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ id: "m-3" });
    mockDel.mockResolvedValue(undefined);
  });

  it("shows a member added after a removal once the server refetches", async () => {
    // delay: null — the full suite runs ~60 files in parallel and the
    // default inter-key delay pushes this file past vitest's 5s testTimeout.
    const user = userEvent.setup({ delay: null });
    renderPage();

    // ── Baseline: both members are listed.
    expect(await screen.findByText("ada@acme.com")).toBeInTheDocument();
    expect(screen.getByText("bob@acme.com")).toBeInTheDocument();

    // ── Remove Ada. The DELETE returns no body, so the row disappears
    //    locally — but the removal must NOT freeze the list.
    await user.click(screen.getByTitle("Remove member"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.queryByText("ada@acme.com")).not.toBeInTheDocument();
    });
    expect(mockDel).toHaveBeenCalledWith("/v1/projects/p-1/members/u-a");
    expect(screen.getByText("bob@acme.com")).toBeInTheDocument();

    // ── The server now has a third member (added by someone else).
    serverMembers = [ADA, OWNER, CAROL];

    // ── Trigger a server refetch: adding a member refetches the list.
    await user.click(screen.getByRole("button", { name: "Add Member" }));
    const addDialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(addDialog).getByLabelText("User"),
      "u-c",
    );
    await user.click(within(addDialog).getByRole("button", { name: "Add Member" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/v1/projects/p-1/members", {
        user_id: "u-c",
        role: "member",
      });
    });

    // The refetched server data must win: the newly added member shows up…
    expect(await screen.findByText("carol@acme.com")).toBeInTheDocument();
    // …while the locally-removed member stays hidden.
    expect(screen.queryByText("ada@acme.com")).not.toBeInTheDocument();
  }, 30_000);
});
