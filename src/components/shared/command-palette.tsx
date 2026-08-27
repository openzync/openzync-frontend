"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Search,
  Users,
  Settings,
  FolderKanban,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { get } from "@/lib/api-client";
import { useUser } from "@/contexts/user-context";
import {
  NAV_SECTIONS,
  isVisible,
  type NavEntry,
} from "@/lib/nav";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  type: string;
  id: string;
  label: string;
  subtitle: string | null;
  href: string;
}

interface GlobalSearchResponse {
  results: SearchResult[];
  query: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Navigation items ──────────────────────────────────────────────────────

// Palette-only destinations: reachable by everyone, no gated manifest entry.
const PERSONAL_SECTION: { label: string; entries: NavEntry[] } = {
  label: "Navigation",
  entries: [
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Account", href: "/account", icon: Settings },
  ],
};

// ─── Icons for search result types ─────────────────────────────────────────

const TYPE_ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  user: Users,
  session: MessageSquare,
};

const defaultIcon = FolderKanban;

// ─── Component ─────────────────────────────────────────────────────────────

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { can, isSuperadmin } = useUser();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced API search
  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await get<GlobalSearchResponse>(
          `/v1/search?q=${encodeURIComponent(query)}&limit=10`,
        );
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter navigation sections locally: permission-gated entries first, then
  // query. Sections render as separate cmdk groups (heading = section label).
  const q = query.toLowerCase();
  const filteredSections: { label: string; items: NavEntry[] }[] = [
    PERSONAL_SECTION,
    ...NAV_SECTIONS,
  ]
    .map((section) => ({
      label: section.label,
      items: section.entries
        .filter((entry) => isVisible(entry, can, isSuperadmin))
        .filter(
          (entry) =>
            query.length < 1 ||
            entry.label.toLowerCase().includes(q) ||
            section.label.toLowerCase().includes(q),
        ),
    }))
    .filter((section) => section.items.length > 0);

  const handleSelect = useCallback(
    (href: string) => {
      router.push(href);
      onOpenChange(false);
    },
    [router, onOpenChange],
  );

  const groupedResults = {
    projects: results.filter((r) => r.type === "project"),
    users: results.filter((r) => r.type === "user"),
    sessions: results.filter((r) => r.type === "session"),
  };

  const hasResults =
    groupedResults.projects.length > 0 ||
    groupedResults.users.length > 0 ||
    groupedResults.sessions.length > 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50",
            "bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-[15%] left-1/2 -translate-x-1/2 z-50",
            "w-[calc(100%-2rem)] max-w-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          )}
        >
          <Command
            className="rounded-xl border border-surface-800 bg-surface-900 shadow-2xl shadow-black/40 overflow-hidden focus:outline-none"
            shouldFilter={false}
          >
            {/* ── Input bar ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 border-b border-surface-800 px-4">
              <Search size={18} className="shrink-0 text-surface-500" />
              <Command.Input
                placeholder="Search projects, users, sessions\u2026"
                value={query}
                onValueChange={setQuery}
                className="flex-1 bg-transparent py-4 text-sm text-text-primary placeholder:text-surface-500 focus:outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-surface-700 bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium text-surface-400">
                <span className="text-xs">&#8984;</span>K
              </kbd>
            </div>

            {/* ── Results list ──────────────────────────────────────────── */}
            <Command.List className="max-h-80 overflow-y-auto px-0 py-2">
              {/* Empty state */}
              {query.length > 0 && !loading && !hasResults && filteredSections.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-surface-500">No results found.</p>
                </div>
              )}

              {/* ── Navigation groups (one per section) ─────────────────── */}
              {filteredSections.map((section) => (
                <Command.Group
                  key={section.label}
                  heading={section.label}
                  className={cn(
                    "pb-2",
                    "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2",
                    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold",
                    "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                    "[&_[cmdk-group-heading]]:text-surface-500",
                  )}
                >
                  {section.items.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <Command.Item
                        key={entry.href}
                        value={`nav-${entry.href}`}
                        onSelect={() => handleSelect(entry.href)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-4 py-2.5 mx-2 text-sm text-surface-200",
                          "data-[selected=true]:bg-surface-800 data-[selected=true]:text-text-primary",
                          "cursor-pointer transition-colors",
                        )}
                      >
                        <Icon size={18} className="shrink-0 text-surface-400" />
                        <span>{entry.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}

              {/* ── Loading indicator ──────────────────────────────────── */}
              {loading && (
                <div className="flex items-center gap-2 px-4 py-2 text-xs text-surface-500">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-surface-400 border-t-transparent" />
                  Searching\u2026
                </div>
              )}

              {/* ── Projects group ─────────────────────────────────────── */}
              {groupedResults.projects.length > 0 && (
                <Command.Group
                  heading="Projects"
                  className={cn(
                    "pb-2",
                    "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2",
                    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold",
                    "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                    "[&_[cmdk-group-heading]]:text-surface-500",
                  )}
                >
                  {groupedResults.projects.map((result) => {
                    const Icon = TYPE_ICONS[result.type] ?? defaultIcon;
                    return (
                      <Command.Item
                        key={result.id}
                        value={`project-${result.id}`}
                        onSelect={() => handleSelect(result.href)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-4 py-2.5 mx-2 text-sm text-surface-200",
                          "data-[selected=true]:bg-surface-800 data-[selected=true]:text-text-primary",
                          "cursor-pointer transition-colors",
                        )}
                      >
                        <Icon size={18} className="shrink-0 text-surface-400" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate">{result.label}</span>
                          {result.subtitle && (
                            <span className="truncate text-xs text-surface-500">
                              {result.subtitle}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-surface-800 px-1.5 py-0.5 text-[10px] uppercase text-surface-400">
                          {result.type}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* ── Users group ────────────────────────────────────────── */}
              {groupedResults.users.length > 0 && (
                <Command.Group
                  heading="Users"
                  className={cn(
                    "pb-2",
                    "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2",
                    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold",
                    "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                    "[&_[cmdk-group-heading]]:text-surface-500",
                  )}
                >
                  {groupedResults.users.map((result) => {
                    const Icon = TYPE_ICONS[result.type] ?? defaultIcon;
                    return (
                      <Command.Item
                        key={result.id}
                        value={`user-${result.id}`}
                        onSelect={() => handleSelect(result.href)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-4 py-2.5 mx-2 text-sm text-surface-200",
                          "data-[selected=true]:bg-surface-800 data-[selected=true]:text-text-primary",
                          "cursor-pointer transition-colors",
                        )}
                      >
                        <Icon size={18} className="shrink-0 text-surface-400" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate">{result.label}</span>
                          {result.subtitle && (
                            <span className="truncate text-xs text-surface-500">
                              {result.subtitle}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-surface-800 px-1.5 py-0.5 text-[10px] uppercase text-surface-400">
                          {result.type}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* ── Sessions group ─────────────────────────────────────── */}
              {groupedResults.sessions.length > 0 && (
                <Command.Group
                  heading="Sessions"
                  className={cn(
                    "pb-2",
                    "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2",
                    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold",
                    "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest",
                    "[&_[cmdk-group-heading]]:text-surface-500",
                  )}
                >
                  {groupedResults.sessions.map((result) => {
                    const Icon = TYPE_ICONS[result.type] ?? defaultIcon;
                    return (
                      <Command.Item
                        key={result.id}
                        value={`session-${result.id}`}
                        onSelect={() => handleSelect(result.href)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-4 py-2.5 mx-2 text-sm text-surface-200",
                          "data-[selected=true]:bg-surface-800 data-[selected=true]:text-text-primary",
                          "cursor-pointer transition-colors",
                        )}
                      >
                        <Icon size={18} className="shrink-0 text-surface-400" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate">{result.label}</span>
                          {result.subtitle && (
                            <span className="truncate text-xs text-surface-500">
                              {result.subtitle}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-surface-800 px-1.5 py-0.5 text-[10px] uppercase text-surface-400">
                          {result.type}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
