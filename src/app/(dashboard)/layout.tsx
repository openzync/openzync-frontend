"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

import {
  MessageSquare,
  BrainCircuit,
  GitBranch,
  Shield,
  Key,
  Settings,
  Search,
  Users,

  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  MapPin,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NAV_SECTIONS,
  isVisible,
  resolveBreadcrumb,
  type NavSectionId,
} from "@/lib/nav";
import { get, getAccessToken, clearTokens } from "@/lib/api-client";
import { getJwtPayload } from "@/lib/jwt";
import { RequireAuth } from "./require-auth";
import { useUser } from "@/contexts/user-context";
import { ConfigDirtyProvider, useConfigDirty } from "@/contexts/config-dirty";
import { Breadcrumb } from "@/components/breadcrumb";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";
import { CommandPalette } from "@/components/shared/command-palette";
import { AppVersion } from "@/components/shared/app-version";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Extract project ID from pathname like /projects/<id>/... */
function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

/** Check if we are inside a project page */
function isInProject(pathname: string): boolean {
  return pathname.startsWith("/projects/");
}

/** Check if we are on the project list page (not inside a specific project) */
function isOnProjectList(pathname: string): boolean {
  return pathname === "/projects";
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

/**
 * Wraps an element in a Tooltip only while `show` is true — used for
 * collapsed-sidebar icon-only controls whose label would otherwise be
 * inaccessible (replaces the old native `title` attributes).
 */
function CollapsedTip({
  show,
  label,
  children,
}: {
  show: boolean;
  label: string;
  children: React.ReactElement;
}) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Real <Link> for every sidebar destination — right-click / open-in-new-tab
 * work, and screen readers announce navigation. `onClick` still fires (used by
 * the mobile drawer to close itself alongside navigation). When the sidebar is
 * collapsed the visible label disappears, so a Tooltip carries it instead.
 */
function SidebarLink({
  href,
  active,
  collapsed,
  centerCollapsed,
  title,
  onClick,
  children,
}: {
  href: string;
  active?: boolean;
  collapsed?: boolean;
  /** Center the icon when collapsed (matches the previous per-section styling). */
  centerCollapsed?: boolean;
  /** Label revealed as a Tooltip when collapsed; redundant when expanded. */
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  // Unsaved-changes guard: intercept plain clicks while a page is dirty and
  // route them through the provider's confirm dialog. Modified clicks
  // (cmd/ctrl/shift — new tab/window) pass through untouched.
  const { isDirty, navigate } = useConfigDirty();
  return (
    <CollapsedTip show={Boolean(collapsed && title)} label={title ?? ""}>
      <Link
        href={href}
        onClick={(e) => {
          onClick?.();
          if (!isDirty || e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          navigate(href);
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
          centerCollapsed && collapsed && "justify-center px-0",
          active
            ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
            : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
        )}
      >
        {children}
      </Link>
    </CollapsedTip>
  );
}

function Sidebar({
  collapsed,
  onToggle,
  onClose,
  onSearchOpen,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
  onSearchOpen?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, isSuperadmin } = useUser();

  const inProject = isInProject(pathname);
  const onProjectList = isOnProjectList(pathname);
  const projectId = extractProjectId(pathname);
  const { pinned } = usePinnedProjects();

  const [currentUserLabel, setCurrentUserLabel] = useState("User");

  // Fetch user info on mount
  useEffect(() => {
    const userId = getJwtPayload(getAccessToken())?.sub;
    if (typeof userId !== "string" || !userId) {
      setCurrentUserLabel("User");
      return;
    }
    get<{ email?: string; name?: string }>(`/v1/users/${userId}`)
      .then((user) => {
        if (user?.email) setCurrentUserLabel(user.email);
        else setCurrentUserLabel(user?.name || userId.slice(0, 8));
      })
      .catch((err) => {
        console.error("Failed to fetch user profile", err);
        setCurrentUserLabel(userId.slice(0, 8));
      });
  }, []);

  const isActive = (href: string) => {
    if (href === "/overview") return pathname === "/overview";
    return pathname.startsWith(href);
  };

  // Manifest entries the current user may see, in declared order.
  const visibleEntries = (sectionId: NavSectionId) =>
    (NAV_SECTIONS.find((s) => s.id === sectionId)?.entries ?? []).filter((entry) =>
      isVisible(entry, can, isSuperadmin),
    );

  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "flex h-full flex-col border-r border-surface-800 bg-surface-900 transition-all duration-300",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-surface-800">
        {collapsed ? (
          <button onClick={onToggle} className="flex items-center justify-center w-full group" title="Expand sidebar">
            <svg viewBox="0 0 28 28" width="24" height="24" className="group-hover:hidden" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="26" height="26" rx="13" fill="#040507"/>
              <path d="M5.5 8.5h17l-8.5 6.5 8.5 6.5h-17l8.5-6.5z" fill="#78a8f1"/>
            </svg>
            <ChevronRight size={20} className="hidden group-hover:block text-brand-300" />
          </button>
        ) : (
          <>
            <Link href="/overview" className="flex flex-1">
              <img src="/openzync-logo.svg" alt="OpenZync" className="h-12 w-auto" />
            </Link>
            {/* Close button — mobile only */}
            <button
              onClick={onClose}
              className="sm:hidden rounded-md p-1.5 text-surface-400 hover:bg-surface-800"
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
            <button onClick={onToggle} className="hidden sm:flex p-1.5 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-800" title="Collapse sidebar">
              <ChevronLeft size={18} />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav id="sidebar-navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {/* ── Insights (hidden inside project pages) ── */}
        {!inProject && (
          <div>
            <div className={cn("px-2 mb-1.5", collapsed && "pt-2")}>
              {collapsed ? (
                <div className="h-px bg-surface-700" />
              ) : (
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                  Insights
                </h2>
              )}
            </div>
            <div className="space-y-0.5">
              {visibleEntries("insights").map((entry) => {
                const active = isActive(entry.href);
                const Icon = entry.icon;
                return (
                  <SidebarLink
                    key={entry.href}
                    href={entry.href}
                    active={active}
                    title={entry.label}
                    onClick={onClose}
                  >
                    <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                      <Icon size={18} />
                    </span>
                    <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{entry.label}</span>
                  </SidebarLink>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Projects / Pinned projects / View all ── */}
        <div>
          <div className={cn("px-2 mb-1.5", collapsed && "pt-2")}>
            {collapsed ? (
              <div className="h-px bg-surface-700" />
            ) : (
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                Projects
              </h2>
            )}
          </div>
          <div className="space-y-0.5">
            {/* Pinned projects (always visible when any are pinned) */}
            {(inProject ? pinned.filter((p) => p.id !== projectId) : pinned).map((p) => {
              const isActiveProject = pathname.startsWith(`/projects/${p.id}`);
              return (
                <SidebarLink
                  key={p.id}
                  href={`/projects/${p.id}/sessions`}
                  active={isActiveProject}
                  collapsed={collapsed}
                  centerCollapsed
                  title={p.name}
                  onClick={onClose}
                >
                  <span className={cn("shrink-0", isActiveProject ? "text-brand-300" : "text-surface-400")}>
                    <MapPin size={18} />
                  </span>
                  <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{p.name}</span>
                </SidebarLink>
              );
            })}

            {/* View all projects — hidden inside a project, shown in bottom section instead */}
            {!inProject && (
              <SidebarLink
                href="/projects"
                active={onProjectList}
                collapsed={collapsed}
                centerCollapsed
                title="View all projects"
                onClick={onClose}
              >
                <span className="shrink-0 text-surface-400">
                  <FolderKanban size={18} />
                </span>
                <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>View all projects</span>
              </SidebarLink>
            )}

            {/* Project-scoped nav items (only inside a project) */}
            {inProject && (
              <>
                <div className={cn("my-1", collapsed ? "border-t border-surface-700" : "border-t border-surface-800")} />
                {[
                  { label: "Sessions", href: `/projects/${projectId}/sessions`, icon: <MessageSquare size={18} /> },
                  { label: "Memory", href: `/projects/${projectId}/memory`, icon: <BrainCircuit size={18} /> },
                  { label: "Graph Explorer", href: `/projects/${projectId}/graph`, icon: <GitBranch size={18} /> },
                  { label: "Communities", href: `/projects/${projectId}/graph/communities`, icon: <Shield size={18} /> },
                ].map((item) => {
                  const active = isActive(item.href);
                  return (
                    <SidebarLink
                      key={item.href}
                      href={item.href}
                      active={active}
                      collapsed={collapsed}
                      centerCollapsed
                      title={item.label}
                      onClick={onClose}
                    >
                      <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </SidebarLink>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Project Settings (only visible inside a project, project:manage) ── */}
        {/* Members without project:manage 403 on every tab — hide the whole section. */}
        {inProject && can("project:manage") && (
          <div>
            <div className={cn("px-2 mb-1.5", collapsed && "pt-2")}>
              {collapsed ? (
                <div className="h-px bg-surface-700" />
              ) : (
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                  Project Settings
                </h2>
              )}
            </div>
            <div className="space-y-0.5">
              {[
                { label: "Members", href: `/projects/${projectId}/members`, icon: <Users size={18} /> },
                { label: "API Keys", href: `/projects/${projectId}/settings/api-keys`, icon: <Key size={18} /> },
                { label: "Settings", href: `/projects/${projectId}/settings`, icon: <Settings size={18} /> },
              ].map((item) => {
                const active = isActive(item.href);
                return (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    active={active}
                    title={item.label}
                    onClick={onClose}
                  >
                    <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                      {item.icon}
                    </span>
                    <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{item.label}</span>
                  </SidebarLink>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Administration (permission-gated, hidden inside project pages) ── */}
        {!inProject &&
          (() => {
            // Users/org member management → members:read; config surfaces → configuration:read.
            // The section header collapses with the items so members never see a bare header.
            const adminEntries = visibleEntries("admin");
            if (adminEntries.length === 0) return null;
            return (
              <div>
                <div className={cn("px-2 mb-1.5", collapsed && "pt-2")}>
                  {collapsed ? (
                    <div className="h-px bg-surface-700" />
                  ) : (
                    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                      Administration
                    </h2>
                  )}
                </div>
                <div className="space-y-0.5">
                  {adminEntries.map((entry) => {
                    const active = isActive(entry.href);
                    const Icon = entry.icon;
                    return (
                      <SidebarLink
                        key={entry.href}
                        href={entry.href}
                        active={active}
                        title={entry.label}
                        onClick={onClose}
                      >
                        <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                          <Icon size={18} />
                        </span>
                        <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{entry.label}</span>
                      </SidebarLink>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {/* ── System (hidden inside project pages; header hides with items) ── */}
        {!inProject &&
          (() => {
            const systemEntries = visibleEntries("system");
            if (systemEntries.length === 0) return null;
            return (
              <div>
                <div className={cn("px-2 mb-1.5", collapsed && "pt-2")}>
                  {collapsed ? (
                    <div className="h-px bg-surface-700" />
                  ) : (
                    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                      System
                    </h2>
                  )}
                </div>
                <div className="space-y-0.5">
                  {systemEntries.map((entry) => {
                    const active = isActive(entry.href);
                    const Icon = entry.icon;
                    return (
                      <SidebarLink
                        key={entry.href}
                        href={entry.href}
                        active={active}
                        title={entry.label}
                        onClick={onClose}
                      >
                        <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                          <Icon size={18} />
                        </span>
                        <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{entry.label}</span>
                      </SidebarLink>
                    );
                  })}
                </div>
              </div>
            );
          })()}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto border-t border-surface-800 p-2 space-y-1">
        {/* View all projects — bottom section when inside a project */}
        {inProject && (
          <CollapsedTip show={collapsed} label="View all projects">
            <Link
              href="/projects"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
            >
              <FolderKanban size={18} />
              <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>View all projects</span>
            </Link>
          </CollapsedTip>
        )}

        {/* Search — opens command palette */}
        <CollapsedTip show={collapsed} label="Search">
          <button
            onClick={() => onSearchOpen?.()}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
          >
            <Search size={18} />
            <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>Search</span>
          </button>
        </CollapsedTip>

        {/* User avatar + menu — Radix handles focus, typeahead, Escape,
            click-outside; placement is bottom-up like the old hand-rolled
            popover. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
              title={collapsed ? currentUserLabel : undefined}
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="rounded-full bg-brand-500 text-[10px] font-bold text-white">
                  {(currentUserLabel?.[0] || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{currentUserLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <div className="border-b border-surface-800 mb-1 px-2 py-1.5 text-sm text-surface-400">
              {currentUserLabel}
            </div>
            <DropdownMenuItem asChild>
              <Link href="/account" className="flex items-center gap-2">
                <Settings size={14} />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                clearTokens();
                router.push("/login");
              }}
            >
              <LogOut size={14} />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AppVersion />
      </div>
    </aside>
  );
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const inProject = isInProject(pathname);
  const projectId = extractProjectId(pathname);
  const [projectName, setProjectName] = useState<string | null>(null);

  // Fetch project name when inside a project
  // ProjectProvider is mounted at projects/[id]/layout.tsx (below this layout), so
  // useProject() here would always be the default null — use the typed client instead.
  useEffect(() => {
    if (projectId) {
      get<{ name: string }>(`/v1/projects/${projectId}`)
        .then((data) => setProjectName(data?.name ?? null))
        .catch((err) => {
          console.error("Failed to fetch project name", err);
          setProjectName(null); // null state triggers error boundary
        });
    } else {
      setProjectName(null);
    }
  }, [projectId]);

  // Open command palette on Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Breadcrumb from the nav manifest + project-path ladder (src/lib/nav.ts)
  const breadcrumbItems = resolveBreadcrumb(pathname, projectName);

  return (
    <RequireAuth>
    <ConfigDirtyProvider>
    <TooltipProvider delayDuration={200}>
    <div className="flex h-screen overflow-hidden bg-surface-950">
      {/* Floating mobile hamburger */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-30 sm:hidden rounded-md p-2 bg-surface-900 border border-surface-800 text-surface-400 shadow-lg hover:bg-surface-800"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-56 transition-transform duration-300 sm:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar collapsed={false} onToggle={() => {}} onClose={() => setMobileOpen(false)} onSearchOpen={() => setSearchOpen(true)} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden sm:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSearchOpen={() => setSearchOpen(true)}
        />
      </div>

      {/* Page content */}
      <main id="main-content" className="flex-1 overflow-y-auto">
        {/* Breadcrumb — only shown for deep navigation context (project sub-pages etc.) */}
        {breadcrumbItems.length >= 3 && (
          <div className="px-6 pt-3 pb-0">
            <Breadcrumb items={breadcrumbItems} className="text-xs text-surface-500" />
          </div>
        )}
        <div className={cn("mx-auto max-w-7xl animate-fade-in", breadcrumbItems.length >= 3 ? "p-6 pt-3" : "p-6")}>
          {children}
        </div>
      </main>
    </div>
    </TooltipProvider>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </ConfigDirtyProvider>
    </RequireAuth>
  );
}
