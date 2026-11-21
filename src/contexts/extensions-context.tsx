"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listAddons, type AddonResponse } from "@/lib/api-client";
import type { ExtensionPanelRef } from "@/lib/nav";

interface ExtensionsContextValue {
  addons: AddonResponse[];
  panels: ExtensionPanelRef[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Find an enabled add-on by id — undefined covers unknown AND disabled. */
  findAddon: (id: string) => AddonResponse | undefined;
}

const ExtensionsContext = createContext<ExtensionsContextValue | undefined>(
  undefined,
);

/**
 * Fetches the add-on registry once per session (under RequireAuth, so the
 * access token is available) and derives the Extensions nav panels from
 * enabled add-ons that expose `panels`. Platform-wide — not scoped per user.
 * Sidebar, palette, and breadcrumbs read through this single source.
 */
export function ExtensionsProvider({ children }: { children: ReactNode }) {
  const [addons, setAddons] = useState<AddonResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAddons();
      setAddons(res.data ?? []);
    } catch (err) {
      // Non-superadmins 403 here — hide Extensions, don't break the shell.
      setAddons([]);
      setError(err instanceof Error ? err.message : "Failed to load add-ons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer through a microtask so the state update is not synchronous
    // within the effect body (react-hooks/set-state-in-effect).
    const run = async () => {
      await refresh();
    };
    void run();
  }, [refresh]);

  const panels = useMemo<ExtensionPanelRef[]>(
    () =>
      addons
        .filter((a) => a.enabled && Array.isArray(a.panels) && a.panels.length > 0)
        .flatMap((a) =>
          (a.panels ?? []).map((p) => ({
            addonId: a.id,
            label: p.title || p.id,
            href: `/ext/${a.id}${p.path.startsWith("/") ? p.path : `/${p.path}`}`,
          })),
        ),
    [addons],
  );

  const findAddon = useCallback(
    (id: string) => addons.find((a) => a.id === id && a.enabled),
    [addons],
  );

  const value = useMemo(
    () => ({ addons, panels, loading, error, refresh, findAddon }),
    [addons, panels, loading, error, refresh, findAddon],
  );

  return (
    <ExtensionsContext.Provider value={value}>
      {children}
    </ExtensionsContext.Provider>
  );
}

export function useExtensions(): ExtensionsContextValue {
  const ctx = useContext(ExtensionsContext);
  if (!ctx)
    throw new Error("useExtensions must be used within an ExtensionsProvider");
  return ctx;
}

/** Null outside the provider (palette tests, pre-auth trees) — no throw. */
export function useExtensionsOptional(): ExtensionsContextValue | null {
  return useContext(ExtensionsContext) ?? null;
}
