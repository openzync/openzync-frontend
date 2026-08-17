import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UserProvider, useUser } from "@/contexts/user-context";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.clear();
  sessionStorage.setItem("mg_access_token", "test-token");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Probe ──────────────────────────────────────────────────────────────────────

function mockMe(body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function Probe({ checks }: { checks: string[] }) {
  const { role, permissions, can, loading } = useUser();
  if (loading) return <div data-testid="loading">loading</div>;
  return (
    <div>
      <span data-testid="role">{role ?? "null"}</span>
      <span data-testid="permissions">{permissions.join(",")}</span>
      {checks.map((p) => (
        <span key={p} data-testid={`can:${p}`}>
          {String(can(p))}
        </span>
      ))}
    </div>
  );
}

function renderProbe(checks: string[]) {
  return render(
    <UserProvider>
      <Probe checks={checks} />
    </UserProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("UserProvider can()", () => {
  it("admin role is a wildcard — can() true even with an empty permission list", async () => {
    mockMe({ id: "u1", email: "admin@acme.com", role: "admin", permissions: [] });
    renderProbe(["project:read", "configuration:read", "members:write"]);

    expect(await screen.findByTestId("role")).toHaveTextContent("admin");
    for (const p of ["project:read", "configuration:read", "members:write"]) {
      expect(screen.getByTestId(`can:${p}`)).toHaveTextContent("true");
    }
  });

  it("superadmin role is a wildcard too", async () => {
    mockMe({ id: "u9", email: "root@platform", role: "superadmin", permissions: [] });
    renderProbe(["project:manage"]);

    expect(await screen.findByTestId("role")).toHaveTextContent("superadmin");
    expect(screen.getByTestId("can:project:manage")).toHaveTextContent("true");
  });

  it("member matches against the effective permission list only", async () => {
    mockMe({
      id: "u2",
      email: "member@acme.com",
      role: "member",
      permissions: ["project:read", "project:write"],
    });
    renderProbe(["project:read", "project:write", "configuration:read", "members:write"]);

    expect(await screen.findByTestId("role")).toHaveTextContent("member");
    expect(screen.getByTestId("can:project:read")).toHaveTextContent("true");
    expect(screen.getByTestId("can:project:write")).toHaveTextContent("true");
    expect(screen.getByTestId("can:configuration:read")).toHaveTextContent("false");
    expect(screen.getByTestId("can:members:write")).toHaveTextContent("false");
  });

  it("parses a /me response without the permissions field defensively as []", async () => {
    // Live backend may not have the new field yet — must not crash or unlock.
    mockMe({ id: "u3", email: "legacy@acme.com", role: "member" });
    renderProbe(["project:read", "configuration:read"]);

    expect(await screen.findByTestId("permissions")).toHaveTextContent("");
    expect(screen.getByTestId("can:project:read")).toHaveTextContent("false");
    expect(screen.getByTestId("can:configuration:read")).toHaveTextContent("false");
  });

  it("fails closed on a failed profile fetch — can() false for everything", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    renderProbe(["project:read"]);

    // user stays null, role null, permissions [] → can() false.
    expect(await screen.findByTestId("role")).toHaveTextContent("null");
    expect(screen.getByTestId("can:project:read")).toHaveTextContent("false");
  });
});
