import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import SchemasPage from "@/app/(dashboard)/settings/schemas/page";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { mockListSchemas, mockDeleteSchema, searchParams } = vi.hoisted(() => ({
  mockListSchemas: vi.fn(),
  mockDeleteSchema: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    // The mocked router records the new sort in the shared search params —
    // the real router would navigate and re-render the page, which is what
    // makes the list refetch (useApiQuery's refreshKey is the sort).
    replace: vi.fn((url: string) => {
      const next = new URLSearchParams(url.split("?")[1] ?? "");
      searchParams.set("sort_by", next.get("sort_by") ?? "");
      searchParams.set("sort_dir", next.get("sort_dir") ?? "");
    }),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings/schemas",
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  listSchemas: mockListSchemas,
  deleteSchema: mockDeleteSchema,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface SchemaRow {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  json_schema: Record<string, unknown>;
  prompt_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ALPHA: SchemaRow = {
  id: "s-1",
  organization_id: "org-1",
  name: "Alpha Schema",
  type: "structured",
  json_schema: { properties: { title: { type: "string" } } },
  prompt_template: null,
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const BETA: SchemaRow = {
  ...ALPHA,
  id: "s-2",
  name: "Beta Schema",
};

const GAMMA: SchemaRow = {
  ...ALPHA,
  id: "s-3",
  name: "Gamma Schema",
};

/** The server's view of the schema list — mutated by the test as the API evolves. */
let serverSchemas: SchemaRow[];

function renderPage() {
  return render(
    <TooltipProvider>
      <SchemasPage />
    </TooltipProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("SchemasPage — removal does not freeze the list", () => {
  beforeEach(() => {
    mockListSchemas.mockReset();
    mockDeleteSchema.mockReset();
    searchParams.delete("sort_by");
    searchParams.delete("sort_dir");
    serverSchemas = [ALPHA, BETA];

    mockListSchemas.mockImplementation(() =>
      Promise.resolve({ data: serverSchemas, total: serverSchemas.length }),
    );
    mockDeleteSchema.mockResolvedValue(undefined);
  });

  it("shows a schema re-activated with the same id once the server stops returning it as active", async () => {
    // delay: null — the full suite runs ~60 files in parallel and the
    // default inter-key delay pushes this file past vitest's 5s testTimeout.
    const user = userEvent.setup({ delay: null });
    const { rerender } = renderPage();

    expect(await screen.findByText("Alpha Schema")).toBeInTheDocument();

    // ── Delete Alpha. The backend soft-deletes (is_active → false) and
    //    keeps returning the row, so the row disappears locally only.
    const alphaRow = screen.getByText("Alpha Schema").closest("tr");
    await user.click(
      within(alphaRow as HTMLElement).getByRole("button", { name: "Delete schema" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Alpha Schema")).not.toBeInTheDocument();
    });
    expect(mockDeleteSchema).toHaveBeenCalledWith("s-1");

    // ── Refetch #1: the server still returns the row, but it is no longer
    //    ACTIVE. "The server no longer has it" means "it is no longer an
    //    active row" — so the id must leave the local removal filter.
    serverSchemas = [{ ...ALPHA, is_active: false }, BETA, GAMMA];
    await user.click(screen.getByRole("button", { name: /^Sort by Name/ }));
    rerender(
      <TooltipProvider>
        <SchemasPage />
      </TooltipProvider>,
    );

    // The refetched server data is applied…
    expect(await screen.findByText("Gamma Schema")).toBeInTheDocument();
    // …and the soft-deleted schema stays hidden (it is not active).
    expect(screen.queryByText("Alpha Schema")).not.toBeInTheDocument();

    // ── Refetch #2: the same schema is re-activated with the SAME id.
    serverSchemas = [ALPHA, BETA, GAMMA];
    await user.click(screen.getByRole("button", { name: /^Sort by Name/ }));
    rerender(
      <TooltipProvider>
        <SchemasPage />
      </TooltipProvider>,
    );

    // The re-activated row must be rendered again — a removal that is never
    // reconciled with the server would keep the id hidden forever.
    expect(await screen.findByText("Alpha Schema")).toBeInTheDocument();
  }, 30_000);
});
