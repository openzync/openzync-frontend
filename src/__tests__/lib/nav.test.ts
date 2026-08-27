import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NAV_SECTIONS, isVisible, resolveBreadcrumb } from "@/lib/nav";
import { ALL_PERMISSIONS } from "@/contexts/user-context";

// ─── Manifest integrity ───────────────────────────────────────────────────────

const APP_DIR = join(__dirname, "../../app/(dashboard)");

/** Walk href segments against the app router tree, allowing [dynamic] dirs. */
function routeDirExists(href: string): boolean {
  let current = APP_DIR;
  for (const segment of href.replace(/^\//, "").split("/")) {
    const exact = join(current, segment);
    if (existsSync(exact)) {
      current = exact;
      continue;
    }
    const dynamic = readdirSync(current).find((name) =>
      /^\[[^\]]+\]$/.test(name),
    );
    if (!dynamic) return false;
    current = join(current, dynamic);
  }
  return true;
}

describe("nav manifest integrity", () => {
  it("every entry href resolves to a route directory on disk", () => {
    for (const section of NAV_SECTIONS) {
      for (const entry of section.entries) {
        expect(routeDirExists(entry.href), `${entry.href} has no route dir`).toBe(
          true,
        );
      }
    }
  });

  it("every permission references a known backend permission", () => {
    for (const section of NAV_SECTIONS) {
      for (const entry of section.entries) {
        if (entry.permission !== undefined) {
          expect(ALL_PERMISSIONS).toContain(entry.permission);
        }
      }
    }
  });

  it("hrefs are unique across sections", () => {
    const hrefs = NAV_SECTIONS.flatMap((s) => s.entries.map((e) => e.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("isVisible gating", () => {
  const can = (p: string) => p === "configuration:read";

  it("ungated entries are always visible", () => {
    const overview = NAV_SECTIONS[0].entries[0];
    expect(isVisible(overview, () => false, false)).toBe(true);
  });

  it("permission entries follow can()", () => {
    const schemas = NAV_SECTIONS.find((s) => s.id === "admin")!.entries.find(
      (e) => e.href === "/settings/schemas",
    )!;
    expect(isVisible(schemas, can, false)).toBe(true);
    expect(isVisible(schemas, () => false, false)).toBe(false);
  });

  it("superadminOnly entries require isSuperadmin even with wildcard can()", () => {
    const platformAdmin = NAV_SECTIONS.find((s) => s.id === "system")!.entries.find(
      (e) => e.superadminOnly,
    )!;
    expect(isVisible(platformAdmin, () => true, true)).toBe(true);
    expect(isVisible(platformAdmin, () => true, false)).toBe(false);
  });
});

// ─── resolveBreadcrumb ────────────────────────────────────────────────────────

describe("resolveBreadcrumb", () => {
  it("returns [] for unknown paths", () => {
    expect(resolveBreadcrumb("/nowhere")).toEqual([]);
  });

  it("maps top-level pages to their section root", () => {
    expect(resolveBreadcrumb("/overview")).toEqual([
      { label: "Insights" },
      { label: "Overview" },
    ]);
    expect(resolveBreadcrumb("/users")).toEqual([
      { label: "Administration" },
      { label: "Users" },
    ]);
    expect(resolveBreadcrumb("/audit")).toEqual([
      { label: "System" },
      { label: "Audit Log" },
    ]);
  });

  it("matches the longest manifest prefix", () => {
    // /settings/extractions must not be swallowed by a shorter /settings rule.
    expect(resolveBreadcrumb("/settings/extractions")).toEqual([
      { label: "Administration" },
      { label: "Extractions" },
    ]);
    expect(resolveBreadcrumb("/users/u-1")).toEqual([
      { label: "Administration" },
      { label: "Users" },
    ]);
  });

  it("labels deep links via the subpath map", () => {
    expect(resolveBreadcrumb("/monitoring/query")).toEqual([
      { label: "Insights" },
      { label: "Monitoring", href: "/monitoring" },
      { label: "Query Playground" },
    ]);
  });

  it("keeps the superadmin ladder", () => {
    expect(resolveBreadcrumb("/superadmin/orgs")).toEqual([
      { label: "Platform Admin" },
      { label: "Organizations" },
    ]);
    expect(resolveBreadcrumb("/superadmin/orgs/o-1/members")).toEqual([
      { label: "Platform Admin" },
      { label: "Organizations" },
      { label: "Members" },
    ]);
    expect(resolveBreadcrumb("/superadmin/requests")).toEqual([
      { label: "Platform Admin" },
      { label: "Approval Requests" },
    ]);
  });

  it("labels the personal account page", () => {
    expect(resolveBreadcrumb("/account")).toEqual([
      { label: "System" },
      { label: "Account" },
    ]);
  });

  it("returns just Projects for the project list", () => {
    expect(resolveBreadcrumb("/projects")).toEqual([{ label: "Projects" }]);
  });

  it("builds project crumbs with the project name", () => {
    expect(resolveBreadcrumb("/projects/p-1/sessions", "Acme")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Acme" },
      { label: "Sessions", href: "/projects/p-1/sessions" },
    ]);
  });

  it("falls back to Project when the name is unknown on the project root", () => {
    expect(resolveBreadcrumb("/projects/p-1", null)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project" },
    ]);
  });

  it("resolves session detail and artifact subtabs (previously collapsed to Project)", () => {
    expect(resolveBreadcrumb("/projects/p-1/sessions/s-1", "Acme")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Acme" },
      { label: "Sessions", href: "/projects/p-1/sessions" },
      { label: "Session" },
    ]);
    for (const [segment, label] of [
      ["messages", "Messages"],
      ["facts", "Facts"],
      ["graph", "Graph"],
      ["classifications", "Classifications"],
      ["extractions", "Extractions"],
      ["observations", "Observations"],
    ] as const) {
      expect(
        resolveBreadcrumb(`/projects/p-1/sessions/s-1/${segment}`, "Acme"),
      ).toEqual([
        { label: "Projects", href: "/projects" },
        { label: "Acme" },
        { label: "Sessions", href: "/projects/p-1/sessions" },
        { label },
      ]);
    }
  });

  it("resolves graph communities and project settings subpaths", () => {
    expect(resolveBreadcrumb("/projects/p-1/graph/communities", "Acme")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Acme" },
      { label: "Graph Explorer", href: "/projects/p-1/graph" },
      { label: "Communities" },
    ]);
    expect(resolveBreadcrumb("/projects/p-1/settings/api-keys", "Acme")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Acme" },
      { label: "Project Settings", href: "/projects/p-1/settings" },
      { label: "API Keys" },
    ]);
    expect(resolveBreadcrumb("/projects/p-1/members", "Acme")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Acme" },
      { label: "Members" },
    ]);
  });
});
