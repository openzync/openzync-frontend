"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Activity,
  Users,
  MessageSquare,
  BrainCircuit,
  GitBranch,
  Shield,
  Key,
  FileJson,
  Settings,
  Search,
  Sun,
  Moon,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Webhook,
  FileText,
  FileCode,
  SlidersHorizontal,
  FolderKanban,
  MapPin,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api-client";
import { RequireAuth } from "./require-auth";
import { Breadcrumb } from "@/components/breadcrumb";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";
import { CommandPalette } from "@/components/shared/command-palette";

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

  const inProject = isInProject(pathname);
  const onProjectList = isOnProjectList(pathname);
  const projectId = extractProjectId(pathname);
  const { pinned } = usePinnedProjects();

  const [mounted, setMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentUserLabel, setCurrentUserLabel] = useState("User");
  const { theme, setTheme } = useTheme();

  // Fetch user info on mount
  useEffect(() => {
    setMounted(true);
    const token = sessionStorage.getItem("mg_access_token");
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const userId = payload.sub;
      if (userId) {
        fetch(`${API_BASE}/v1/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((user) => {
            if (user?.email) setCurrentUserLabel(user.email);
            else setCurrentUserLabel(user?.name || userId.slice(0, 8));
          })
          .catch((err) => {
            console.error("Failed to fetch user profile", err);
            setCurrentUserLabel(userId.slice(0, 8));
          });
      }
    } catch {
      setCurrentUserLabel("User");
    }
  }, []);

  // Close user menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [userMenuOpen]);

  const isActive = (href: string) => {
    if (href === "/overview") return pathname === "/overview";
    return pathname.startsWith(href);
  };

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
              {[
                { label: "Overview", href: "/overview", icon: <LayoutDashboard size={18} /> },
                { label: "Monitoring", href: "/monitoring", icon: <Activity size={18} /> },
              ].map((item) => {
                const active = isActive(item.href);
                return (
                  <button
                    key={item.href}
                    onClick={() => { router.push(item.href); onClose?.(); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                        : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                    )}
                  >
                    <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                      {item.icon}
                    </span>
                    <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{item.label}</span>
                  </button>
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
                <button
                  key={p.id}
                  onClick={() => { router.push(`/projects/${p.id}/sessions`); onClose?.(); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                    collapsed && "justify-center px-0",
                    isActiveProject
                      ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                      : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                  )}
                >
                  <span className={cn("shrink-0", isActiveProject ? "text-brand-300" : "text-surface-400")}>
                    <MapPin size={18} />
                  </span>
                  <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{p.name}</span>
                </button>
              );
            })}

            {/* View all projects — hidden inside a project, shown in bottom section instead */}
            {!inProject && (
              <button
                onClick={() => { router.push("/projects"); onClose?.(); }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                  collapsed && "justify-center px-0",
                  onProjectList
                    ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                    : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                )}
              >
                <span className="shrink-0 text-surface-400">
                  <FolderKanban size={18} />
                </span>
                <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>View all projects</span>
              </button>
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
                    <button
                      key={item.href}
                      onClick={() => { router.push(item.href); onClose?.(); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                          : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                      )}
                    >
                      <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Project Settings (only visible inside a project) ── */}
        {inProject && (
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
                  <button
                    key={item.href}
                    onClick={() => { router.push(item.href); onClose?.(); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                        : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                    )}
                  >
                    <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                      {item.icon}
                    </span>
                    <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Administration (hidden inside project pages) ── */}
        {!inProject && (
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
              {[
                { label: "Users", href: "/users", icon: <Users size={18} /> },
                { label: "Extraction Schemas", href: "/settings/schemas", icon: <FileJson size={18} /> },
                { label: "Webhooks", href: "/settings/webhooks", icon: <Webhook size={18} /> },
                { label: "Extraction Instructions", href: "/settings/extraction-instructions", icon: <FileText size={18} /> },
                { label: "Prompt Templates", href: "/settings/prompts", icon: <FileCode size={18} /> },
                { label: "Configuration", href: "/settings/org-config", icon: <SlidersHorizontal size={18} /> },
              ].map((item) => {
                const active = isActive(item.href);
                return (
                  <button
                    key={item.href}
                    onClick={() => { router.push(item.href); onClose?.(); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                        : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                    )}
                  >
                    <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                      {item.icon}
                    </span>
                    <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── System (hidden inside project pages) ── */}
        {!inProject && (
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
              {[
                { label: "Audit Log", href: "/audit", icon: <Shield size={18} /> },
                { label: "Account Settings", href: "/settings", icon: <Settings size={18} /> },
              ].map((item) => {
                const active = isActive(item.href);
                return (
                  <button
                    key={item.href}
                    onClick={() => { router.push(item.href); onClose?.(); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand-500/10 text-brand-300 border-l-[3px] border-brand-500"
                        : "text-surface-300 hover:bg-surface-800 hover:text-text-primary border-l-[3px] border-transparent",
                    )}
                  >
                    <span className={cn("shrink-0", active ? "text-brand-300" : "text-surface-400")}>
                      {item.icon}
                    </span>
                    <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto border-t border-surface-800 p-2 space-y-1">
        {/* View all projects — bottom section when inside a project */}
        {inProject && (
          <button
            onClick={() => { router.push("/projects"); onClose?.(); }}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
            title={collapsed ? "View all projects" : undefined}
          >
            <FolderKanban size={18} />
            <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>View all projects</span>
          </button>
        )}

        {/* Search — opens command palette */}
        <button
          onClick={() => onSearchOpen?.()}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
          title={collapsed ? "Search" : undefined}
        >
          <Search size={18} />
          <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>Search</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
        >
          {!mounted ? (
            <div className="h-[18px] w-[18px]" />
          ) : theme === "dark" ? (
            <Sun size={18} />
          ) : (
            <Moon size={18} />
          )}
          <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>
            {!mounted ? "Theme" : theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </button>

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-surface-400 hover:bg-surface-800 hover:text-text-primary"
            title={collapsed ? currentUserLabel : undefined}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
              {(currentUserLabel?.[0] || "U").toUpperCase()}
            </span>
            <span className={cn("truncate overflow-hidden transition-all duration-300", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>{currentUserLabel}</span>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-full left-0 mb-2 z-20 w-56 rounded-lg border border-surface-800 bg-surface-900 p-1 shadow-lg shadow-black/30 animate-slide-up">
                <div className="px-2 py-1.5 text-sm text-surface-400 border-b border-surface-800 mb-1">
                  {currentUserLabel}
                </div>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-surface-200 hover:bg-surface-800">
                  <UserIcon size={14} />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-surface-200 hover:bg-surface-800"
                >
                  <Settings size={14} />
                  Settings
                </button>
                <hr className="my-1 border-surface-800" />
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    sessionStorage.removeItem("mg_access_token");
                    sessionStorage.removeItem("mg_refresh_token");
                    router.push("/login");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-error hover:bg-surface-800"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
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
  useEffect(() => {
    if (projectId) {
      const token = sessionStorage.getItem("mg_access_token");
      if (!token) return;
      fetch(`${API_BASE}/v1/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setProjectName(data?.name ?? null))
        .catch((err) => {
          console.error("Failed to fetch project name", err);
          setProjectName(null);  // null state triggers error boundary
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

  // Build breadcrumb items from the current pathname
  const breadcrumbItems = (() => {
    // Project pages
    if (pathname.startsWith("/projects/")) {
      const pageLabel = (() => {
        if (pathname.endsWith("/sessions")) return "Sessions";
        if (pathname.endsWith("/memory")) return "Memory";
        if (pathname.includes("/graph/communities")) return "Communities";
        if (pathname.endsWith("/graph")) return "Graph Explorer";
        if (pathname.endsWith("/members")) return "Members";
        if (pathname.endsWith("/settings")) return "Project Settings";
        if (pathname.includes("/settings/api-keys")) return "API Keys";
        if (pathname.match(/\/sessions\/[^/]+$/)) return "Session";
        if (pathname.includes("/messages")) return "Messages";
        if (pathname.includes("/facts")) return "Facts";
        if (pathname.includes("/classifications")) return "Classifications";
        if (pathname.includes("/extractions")) return "Extractions";
        return "Project";
      })();
      return [
        { label: "Projects", href: "/projects" },
        ...(projectName ? [{ label: projectName }] : []),
        { label: pageLabel },
      ];
    }

    // Non-project pages
    if (pathname === "/projects") return [{ label: "Projects" }];
    if (pathname === "/overview") return [{ label: "Insights" }, { label: "Overview" }];
    if (pathname.startsWith("/monitoring")) return [{ label: "Insights" }, { label: "Monitoring" }];
    if (pathname.startsWith("/users")) return [{ label: "Administration" }, { label: "Users" }];
    if (pathname.startsWith("/audit")) return [{ label: "System" }, { label: "Audit Log" }];
    if (pathname.startsWith("/settings")) {
      if (pathname.includes("/api-keys")) return [{ label: "Administration" }, { label: "API Keys" }];
      if (pathname.includes("/schemas")) return [{ label: "Administration" }, { label: "Extraction Schemas" }];
      if (pathname.includes("/classifications")) return [{ label: "Administration" }, { label: "Classifications" }];
      if (pathname.includes("/extractions")) return [{ label: "Administration" }, { label: "Extractions" }];
      if (pathname.includes("/webhooks")) return [{ label: "Administration" }, { label: "Webhooks" }];
      if (pathname.includes("/extraction-instructions")) return [{ label: "Administration" }, { label: "Extraction Instructions" }];
      if (pathname.includes("/prompts")) return [{ label: "Administration" }, { label: "Prompt Templates" }];
      if (pathname.includes("/org-config")) return [{ label: "Administration" }, { label: "Configuration" }];
      return [{ label: "System" }, { label: "Account Settings" }];
    }
    return [];
  })();

  return (
    <RequireAuth>
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
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </RequireAuth>
  );
}
