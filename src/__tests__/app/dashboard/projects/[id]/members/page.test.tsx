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

// The mocked router records the new sort in the shared search params — the
// real router would navigate and re-render the page, which is what makes
// the list refetch (useApiQuery's refreshKey is the sort).
const { searchParams } = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn((url: string) => {
      const next = new URLSearchParams(url.split("?")[1] ?? "");
      searchParams.set("sort_by", next.get("sort_by") ?? "");
      searchParams.set("sort_dir", next.get("sort_dir") ?? "");
    }),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/projects/p-1/members",
  useSearchParams: () => searchParams,
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

const DAVE: MemberRow = {
  id: "m-4",
  user_id: "u-d",
  role: "member",
  created_at: "2025-03-01T00:00:00Z",
  user: { id: "u-d", external_id: "dave", name: "Dave Stone", email: "dave@acme.com" },
};

const MEMBERS_PATH = "/v1/projects/p-1/members";

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
    searchParams.delete("sort_by");
    searchParams.delete("sort_dir");

    mockGet.mockImplementation((path: string) => {
      if (path.startsWith(MEMBERS_PATH)) return Promise.resolve({ data: serverMembers });
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

  it("shows a member re-added with the same id once the server drops the row", async () => {
    // delay: null — the full suite runs ~60 files in parallel and the
    // default inter-key delay pushes this file past vitest's 5s testTimeout.
    const user = userEvent.setup({ delay: null });
    const { rerender } = renderPage();

    expect(await screen.findByText("ada@acme.com")).toBeInTheDocument();

    // ── Remove Ada (hard delete). The row disappears locally.
    await user.click(screen.getByTitle("Remove member"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.queryByText("ada@acme.com")).not.toBeInTheDocument();
    });
    expect(mockDel).toHaveBeenCalledWith("/v1/projects/p-1/members/u-a");

    // ── Refetch #1: the server no longer returns the removed row at all.
    //    A removed id may only stay hidden while the server still returns
    //    that row — once the server drops it, the id leaves the filter.
    serverMembers = [OWNER, CAROL, DAVE];
    await user.click(screen.getByRole("button", { name: /^Sort by Name/ }));
    rerender(<ProjectMembersPage />);

    // The refetched server data is applied…
    expect(await screen.findByText("dave@acme.com")).toBeInTheDocument();
    // …and the removed row is gone with it.
    expect(screen.queryByText("ada@acme.com")).not.toBeInTheDocument();

    // ── Refetch #2: the same member is re-added with the SAME id.
    serverMembers = [ADA, OWNER, CAROL, DAVE];
    await user.click(screen.getByRole("button", { name: /^Sort by Email/ }));
    rerender(<ProjectMembersPage />);

    // The re-added row must be rendered again — a removal that is never
    // reconciled with the server would keep the id hidden forever.
    expect(await screen.findByText("ada@acme.com")).toBeInTheDocument();
  }, 30_000);
});
