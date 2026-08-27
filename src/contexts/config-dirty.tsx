"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface ConfigDirtyContextValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  /**
   * Navigate to `href`, intercepting with a confirm dialog while dirty.
   * Clean navigations pass straight through to router.push.
   */
  navigate: (href: string) => void;
}

const ConfigDirtyContext = createContext<ConfigDirtyContextValue | undefined>(undefined);

/**
 * Single unsaved-changes guard for the whole dashboard.
 *
 * Owns three things so pages don't have to:
 * 1. The dirty flag pages report via setDirty.
 * 2. ONE beforeunload listener, registered only while dirty (replaces the
 *    five per-page copies).
 * 3. In-app navigation interception — SidebarLink and the org-config tab bar
 *    call navigate(href); while dirty a ConfirmDialog gates the jump, and
 *    leaving clears the flag first so the next page starts clean.
 */
export function ConfigDirtyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDirty, setIsDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const setDirty = useCallback((dirty: boolean) => setIsDirty(dirty), []);

  // Any route change discards the guard — the page that owned the unsaved
  // changes is gone (browser back, sidebar Leave, tab switch all land here).
  // Render-phase adjustment so no effect/lint suppression is needed.
  const [routedFrom, setRoutedFrom] = useState(pathname);
  if (pathname !== routedFrom) {
    setRoutedFrom(pathname);
    setIsDirty(false);
    setPendingHref(null);
  }

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const navigate = useCallback(
    (href: string) => {
      if (!isDirty) {
        router.push(href);
        return;
      }
      setPendingHref(href);
    },
    [isDirty, router],
  );

  const confirmLeave = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    setIsDirty(false);
    if (href) router.push(href);
  }, [pendingHref, router]);

  return (
    <ConfigDirtyContext.Provider value={{ isDirty, setDirty, navigate }}>
      {children}
      <ConfirmDialog
        open={pendingHref !== null}
        title="Leave with unsaved changes?"
        message="You have unsaved changes. Discard them and leave?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={confirmLeave}
        onCancel={() => setPendingHref(null)}
      />
    </ConfigDirtyContext.Provider>
  );
}

export function useConfigDirty(): ConfigDirtyContextValue {
  const ctx = useContext(ConfigDirtyContext);
  if (!ctx) throw new Error("useConfigDirty must be used within a ConfigDirtyProvider");
  return ctx;
}
