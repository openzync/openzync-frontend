/**
 * Single source of truth for dashboard navigation.
 *
 * Consumed by the sidebar (app/(dashboard)/layout.tsx), the command palette
 * (components/shared/command-palette.tsx), and breadcrumb derivation — adding
 * an entry here surfaces it everywhere at once.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  FileCode,
  FileJson,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Webhook,
} from "lucide-react";
import type { Permission } from "@/contexts/user-context";
import type { BreadcrumbItem } from "@/components/breadcrumb";

export type PermissionString = Permission;

export interface NavEntry {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see this entry — undefined = visible to all. */
  permission?: PermissionString;
  /** Root/superadmin-only entry (platform console). */
  superadminOnly?: boolean;
}

export type NavSectionId = "insights" | "admin" | "system";

export interface NavSection {
  id: NavSectionId;
  /** Sidebar heading, palette group heading, and breadcrumb root label. */
  label: string;
  entries: NavEntry[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "insights",
    label: "Insights",
    entries: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      // Monitoring is gated on members:read (org-level read access)
      { label: "Monitoring", href: "/monitoring", icon: Activity, permission: "members:read" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    entries: [
      // Users/org member management → members:read; config surfaces → configuration:read.
      { label: "Users", href: "/users", icon: Users, permission: "members:read" },
      { label: "Extraction Schemas", href: "/settings/schemas", icon: FileJson, permission: "configuration:read" },
      { label: "Classifications", href: "/settings/classifications", icon: FileCode, permission: "configuration:read" },
      { label: "Extractions", href: "/settings/extractions", icon: SlidersHorizontal, permission: "configuration:read" },
      { label: "Webhooks", href: "/settings/webhooks", icon: Webhook, permission: "configuration:read" },
      { label: "Extraction Instructions", href: "/settings/extraction-instructions", icon: FileText, permission: "configuration:read" },
      { label: "Prompt Templates", href: "/settings/prompts", icon: MessageSquare, permission: "configuration:read" },
      { label: "Configuration", href: "/settings/org-config", icon: Settings, permission: "configuration:read" },
    ],
  },
  {
    id: "system",
    label: "System",
    entries: [
      // Audit Log is gated on members:read (org-level read access)
      { label: "Audit Log", href: "/audit", icon: Shield, permission: "members:read" },
      // Platform Admin is root/superadmin only — the platform console.
      { label: "Platform Admin", href: "/superadmin/orgs", icon: ShieldCheck, superadminOnly: true },
    ],
  },
];

/** Gate check shared by the sidebar and the command palette. */
export function isVisible(
  entry: NavEntry,
  can: (permission: string) => boolean,
  isSuperadmin: boolean,
): boolean {
  if (entry.superadminOnly) return isSuperadmin;
  return entry.permission === undefined || can(entry.permission);
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

const PROJECT_PAGE_LABELS: Record<string, string> = {
  sessions: "Sessions",
  memory: "Memory",
  graph: "Graph Explorer",
  communities: "Communities",
  members: "Members",
};

/** Artifact subtabs under /projects/:id/sessions/:sid/<artifact>. */
const SESSION_ARTIFACT_LABELS: Record<string, string> = {
  messages: "Messages",
  facts: "Facts",
  graph: "Graph",
  classifications: "Classifications",
  extractions: "Extractions",
  observations: "Observations",
};

/** Deep-link labels under non-project manifest entries (longest-prefix wins). */
const SUBPATH_LABELS: Record<string, string> = {
  "/monitoring/query": "Query Playground",
};

function titleCase(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function projectCrumbs(pathname: string, projectName?: string | null): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean); // ["projects", <id>, ...rest]
  const projectId = segments[1];
  const rest = segments.slice(2);

  const crumbs: BreadcrumbItem[] = [{ label: "Projects", href: "/projects" }];
  if (projectName) crumbs.push({ label: projectName });

  // Project root — the name itself is the leaf.
  if (rest.length === 0) {
    if (!projectName) crumbs.push({ label: "Project" });
    return crumbs;
  }

  const [head, second, third] = rest;
  switch (head) {
    case "sessions": {
      crumbs.push({ label: "Sessions", href: `/projects/${projectId}/sessions` });
      if (!second) break;
      const artifact = SESSION_ARTIFACT_LABELS[second];
      if (artifact) {
        crumbs.push({ label: artifact });
      } else {
        // second is a session id; third (if present) is the artifact subtab.
        crumbs.push({
          label: third
            ? (SESSION_ARTIFACT_LABELS[third] ?? titleCase(third))
            : "Session",
        });
      }
      break;
    }
    case "graph":
      if (second === "communities") {
        crumbs.push(
          { label: "Graph Explorer", href: `/projects/${projectId}/graph` },
          { label: "Communities" },
        );
      } else {
        crumbs.push({ label: "Graph Explorer" });
      }
      break;
    case "settings":
      if (second === "api-keys") {
        crumbs.push(
          { label: "Project Settings", href: `/projects/${projectId}/settings` },
          { label: "API Keys" },
        );
      } else {
        crumbs.push({ label: "Project Settings" });
      }
      break;
    default:
      crumbs.push({ label: PROJECT_PAGE_LABELS[head] ?? titleCase(head) });
  }
  return crumbs;
}

/**
 * Derive breadcrumb items from the pathname. Manifest entries match by
 * longest prefix; project paths get their own ladder so session artifact
 * subtabs (observations/extractions/…) no longer collapse to "Project".
 */
export function resolveBreadcrumb(
  pathname: string,
  projectName?: string | null,
): BreadcrumbItem[] {
  if (pathname === "/projects") return [{ label: "Projects" }];
  if (pathname.startsWith("/projects/")) return projectCrumbs(pathname, projectName);

  // Personal account page (not a manifest entry — ungated).
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return [{ label: "System" }, { label: "Account" }];
  }

  // Superadmin console keeps its own ladder (org-scoped subpages).
  if (pathname.startsWith("/superadmin")) {
    if (pathname.endsWith("/requests")) return [{ label: "Platform Admin" }, { label: "Approval Requests" }];
    if (pathname.endsWith("/config")) return [{ label: "Platform Admin" }, { label: "Organizations" }, { label: "Configuration" }];
    if (pathname.endsWith("/members")) return [{ label: "Platform Admin" }, { label: "Organizations" }, { label: "Members" }];
    if (pathname.endsWith("/orgs")) return [{ label: "Platform Admin" }, { label: "Organizations" }];
    return [{ label: "Platform Admin" }, { label: "System Configuration" }];
  }

  // Longest-prefix match against the manifest.
  let best: { entry: NavEntry; section: NavSection } | undefined;
  for (const section of NAV_SECTIONS) {
    for (const entry of section.entries) {
      if (pathname === entry.href || pathname.startsWith(`${entry.href}/`)) {
        if (!best || entry.href.length > best.entry.href.length) {
          best = { entry, section };
        }
      }
    }
  }
  if (!best) return [];

  const deepLabel = SUBPATH_LABELS[pathname];
  if (deepLabel) {
    return [
      { label: best.section.label },
      { label: best.entry.label, href: best.entry.href },
      { label: deepLabel },
    ];
  }
  return [{ label: best.section.label }, { label: best.entry.label }];
}
