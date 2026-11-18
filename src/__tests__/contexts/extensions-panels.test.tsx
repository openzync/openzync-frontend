import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ExtensionsProvider, useExtensions } from "@/contexts/extensions-context";
import { buildExtensionsSection } from "@/lib/nav";
import { listAddons } from "@/lib/api-client";

// ─── Mocks ───────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-client", () => ({
  listAddons: vi.fn(),
}));

const mockListAddons = vi.mocked(listAddons);

const ADDONS = [
  {
    id: "democrm",
    version: "1.0.0",
    source_type: "local",
    source_ref: "addons/democrm",
    installed_sha: "local-abc",
    latest_seen: "1.0.0",
    enabled: true,
    update_available: false,
    generation: 3,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    panels: [
      { id: "board", title: "Board", path: "/ui/board.html" },
      // Empty title falls back to the panel id.
      { id: "detail", title: "", path: "/ui/sub/detail.html" },
    ],
  },
  {
    id: "disabled",
    version: "1.0.0",
    source_type: "local",
    source_ref: "addons/disabled",
    installed_sha: null,
    latest_seen: null,
    enabled: false,
    update_available: false,
    generation: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    panels: [{ id: "p", title: "Hidden", path: "/ui/p.html" }],
  },
];

function Probe() {
  const { panels, loading, findAddon } = useExtensions();
  if (loading) return <div data-testid="loading">loading</div>;
  const found = findAddon("democrm");
  const missing = findAddon("disabled");
  const unknown = findAddon("nope");
  return (
    <div>
      <span data-testid="count">{panels.length}</span>
      {panels.map((p) => (
        <span key={p.href} data-testid={`panel:${p.addonId}`}>
          {p.label}|{p.href}
        </span>
      ))}
      <span data-testid="found">{found?.id ?? "null"}</span>
      <span data-testid="missing">{missing?.id ?? "null"}</span>
      <span data-testid="unknown">{unknown?.id ?? "null"}</span>
    </div>
  );
}

beforeEach(() => {
  mockListAddons.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Extension context panels ────────────────────────────────────────────────────

describe("ExtensionsProvider panels", () => {
  it("maps {id,title,path} to label/href, title falls back to id", async () => {
    mockListAddons.mockResolvedValueOnce({ data: ADDONS, total: 2 });
    render(
      <ExtensionsProvider>
        <Probe />
      </ExtensionsProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("loading")).toBeNull());
    expect(screen.getByTestId("count").textContent).toBe("2");
    // {id, title, path} → label "title", href /ext/{id}{path}.
    const entries = screen
      .getAllByTestId("panel:democrm")
      .map((e) => e.textContent);
    expect(entries).toContain("Board|/ext/democrm/ui/board.html");
    // Empty title falls back to the panel id.
    expect(entries).toContain("detail|/ext/democrm/ui/sub/detail.html");
  });

  it("findAddon covers enabled only — disabled and unknown are undefined", async () => {
    mockListAddons.mockResolvedValueOnce({ data: ADDONS, total: 2 });
    render(
      <ExtensionsProvider>
        <Probe />
      </ExtensionsProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("loading")).toBeNull());
    expect(screen.getByTestId("found").textContent).toBe("democrm");
    expect(screen.getByTestId("missing").textContent).toBe("null");
    expect(screen.getByTestId("unknown").textContent).toBe("null");
  });

  it("non-superadmin 403 hides extensions instead of breaking the shell", async () => {
    mockListAddons.mockRejectedValueOnce(new Error("Forbidden"));
    render(
      <ExtensionsProvider>
        <Probe />
      </ExtensionsProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("loading")).toBeNull());
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});

// ─── Nav entry visibility ────────────────────────────────────────────────────────

describe("buildExtensionsSection", () => {
  it("exposes one nav entry per panel", () => {
    const section = buildExtensionsSection([
      { addonId: "democrm", label: "Board", href: "/ext/democrm/ui/board.html" },
    ]);
    expect(section.id).toBe("extensions");
    expect(section.entries).toHaveLength(1);
    expect(section.entries[0]).toMatchObject({
      label: "Board",
      href: "/ext/democrm/ui/board.html",
    });
  });

  it("empty panels yield no entries (section hidden by callers)", () => {
    expect(buildExtensionsSection([]).entries).toHaveLength(0);
  });
});
