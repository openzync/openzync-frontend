"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/user-context";
import { useConfigDirty } from "@/contexts/config-dirty";
import { RequirePermission } from "@/components/shared/require-permission";

const TABS = [
  { label: "Registration", href: "/superadmin/config/registration" },
  { label: "Runtime", href: "/superadmin/config/runtime" },
];

/**
 * Platform super-admin console — gated to `isSuperadmin` (root account only).
 * The dashboard layout above already wrapped us in RequireAuth + UserProvider,
 * so the resolved role is available here; unknown/failed roles fail closed.
 */
export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { isSuperadmin, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  // Tab switches route through the shared dirty guard — the ConfirmDialog
  // itself lives in ConfigDirtyProvider (mounted at the dashboard level).
  const { navigate } = useConfigDirty();

  useEffect(() => {
    if (!loading && !isSuperadmin) {
      router.replace("/overview");
    }
  }, [isSuperadmin, loading, router]);

  if (loading) {
    return (
      <div className="card-base p-6">
        <div className="h-5 w-44 rounded bg-surface-800 animate-pulse" />
        <div className="mt-4 h-12 rounded-lg bg-surface-800 animate-pulse" />
      </div>
    );
  }

  // Not a superadmin — the redirect effect above is in flight.
  if (!isSuperadmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">Platform Administration</h1>
        <p className="text-sm text-surface-400 mt-1">
          Platform registration and runtime settings
        </p>
      </div>

      <div className="flex gap-1 p-1 card-base w-fit">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <button
              key={tab.href}
              onClick={() => navigate(tab.href)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-surface-400 hover:text-white hover:bg-surface-800",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Superadmin is a wildcard role, so every superadmin holds
          configuration:read — this mirrors the org-config tab layout. */}
      <RequirePermission permission="configuration:read">{children}</RequirePermission>
    </div>
  );
}
