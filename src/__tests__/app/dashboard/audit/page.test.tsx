import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { useEffect, useReducer } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditLogPage from "@/app/(dashboard)/audit/page";

// ─── Mocks ────────────────────────────────────────────────────────────────────────

const { mockReplace, mockSearchParamsGet, setSearchParams, onMockReplace, mockGet } =
  vi.hoisted(() => {
    // Stateful URL simulation: router.replace writes params back into the
    // search-param mock and notifies subscribers, mirroring how real Next.js
    // re-renders useSearchParams consumers after a replace.
    const params = new Map<string, string>();
    const listeners = new Set<() => void>();
    return {
      mockReplace: vi.fn((url: string) => {
        params.clear();
        for (const [k, v] of new URL(url, "http://x").searchParams) params.set(k, v);
        for (const notify of listeners) notify();
      }),
      mockSearchParamsGet: vi.fn((key: string) => params.get(key) ?? null),
      setSearchParams: (entries: Record<string, string>) => {
        params.clear();
        for (const [k, v] of Object.entries(entries)) params.set(k, v);
      },
      onMockReplace: (cb: () => void) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      mockGet: vi.fn(),
    };
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/audit",
  useSearchParams: () => ({ get: (key: string) => mockSearchParamsGet(key) }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  get: mockGet,
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    user: { id: "u1", role: "admin", permissions: [] },
    loading: false,
    isSuperadmin: false,
    can: () => true,
  }),
}));

vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/guides", () => ({
  PageGuide: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  GuideSecurity: () => <div>Security Icon</div>,
}));

// ─── Fixtures & helpers ───────────────────────────────────────────────────────────

function auditResponse(offset: number) {
  return {
    items: [
      {
        id: `entry-${offset}`,
        action: "session.create",
        actor_id: "user-1",
        actor_type: "user",
        resource_type: null,
        resource_id: null,
        details: null,
        ip_address: "127.0.0.1",
        status_code: 200,
        method: "POST",
        path: "/v1/sessions",
        created_at: new Date().toISOString(),
      },
    ],
    total: 60, // three pages at PAGE_SIZE=25
  };
}

/** Re-renders whenever the URL mock changes — stands in for Next.js
 * re-rendering useSearchParams consumers after router.replace. */
function AuditPageHarness() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsub = onMockReplace(force);
    return () => {
      unsub();
    };
  }, []);
  return <AuditLogPage />;
}

async function lastAuditCall(): Promise<string> {
  await vi.waitFor(() => {
    expect(mockGet).toHaveBeenCalled();
  });
  const calls = mockGet.mock.calls.filter((c: unknown[]) =>
    String(c[0]).startsWith("/v1/admin/audit-logs"),
  );
  return String(calls[calls.length - 1][0]);
}

/** URL of the most recent router.replace call. */
function lastReplaceUrl(): string {
  const calls = mockReplace.mock.calls;
  return String(calls[calls.length - 1][0]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("AuditLogPage URL state", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.scrollIntoView = () => {};
  });

  beforeEach(() => {
    mockGet.mockReset();
    mockReplace.mockClear();
    setSearchParams({});
    mockGet.mockImplementation((path: string) => {
      if (path.startsWith("/v1/admin/audit-logs")) {
        const offset = Number(new URLSearchParams(path.split("?")[1]).get("offset") ?? 0);
        return Promise.resolve(auditResponse(offset));
      }
      if (path === "/v1/users") return Promise.resolve({ data: [{ id: "user-1", name: "U", email: null }] });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deep-links a filtered view: ?action= reaches the API unchanged", async () => {
    setSearchParams({ action: "session.create" });
    render(<AuditPageHarness />);

    const url = await lastAuditCall();
    expect(url).toContain("action=session.create");
    expect(screen.getByLabelText("Action")).toHaveValue("session.create");
  });

  it("round-trips filter edits through the URL (empty value drops the param)", async () => {
    const user = userEvent.setup();
    render(<AuditPageHarness />);
    await lastAuditCall();

    const input = screen.getByLabelText("Action");
    await user.type(input, "a");

    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });
    expect(lastReplaceUrl()).toContain("action=a");

    // Clearing the input removes the param entirely instead of writing ?action=.
    await user.clear(input);
    await vi.waitFor(() => {
      expect(lastReplaceUrl()).not.toContain("action=");
    });
  });

  it("clamps invalid filter and page params to defaults", async () => {
    setSearchParams({ actor_type: "bogus", status: "nope", page: "-4" });
    render(<AuditPageHarness />);

    const url = await lastAuditCall();
    // Clamped values are treated as absent — no actor_type/status filters,
    // offset back to 0.
    expect(url).not.toContain("actor_type=");
    expect(url).not.toContain("status_code=");
    expect(url).toContain("offset=0");
  });

  it("pagination reads and writes ?page=", async () => {
    const user = userEvent.setup();
    setSearchParams({ page: "2" });
    render(<AuditPageHarness />);

    // Page 2 → offset 25.
    expect(await lastAuditCall()).toContain("offset=25");

    // Next → ?page=3 → offset 50. Footer renders once the fetch resolves.
    await user.click(await screen.findByTitle("Next page"));
    await vi.waitFor(() => {
      expect(lastReplaceUrl()).toContain("page=3");
    });

    // Previous from page 3 steps back to ?page=2 …
    await user.click(await screen.findByTitle("Previous page"));
    await vi.waitFor(() => {
      expect(lastReplaceUrl()).toContain("page=2");
    });

    // … and from page 2 it drops the param entirely (page 1 is the default).
    await user.click(await screen.findByTitle("Previous page"));
    await vi.waitFor(() => {
      expect(lastReplaceUrl()).not.toContain("page=");
    });
  });

  it("Clear removes every filter param at once", async () => {
    const user = userEvent.setup();
    setSearchParams({ action: "x", actor_type: "user", status: "2xx" });
    render(<AuditPageHarness />);
    await lastAuditCall();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await vi.waitFor(() => {
      expect(lastReplaceUrl()).toBe("/audit");
    });
  });
});
