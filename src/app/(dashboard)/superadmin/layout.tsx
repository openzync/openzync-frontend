"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, Building2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/user-context";

const TABS = [
  { label: "requests", href: "/superadmin/requests", icon: <Inbox size={16} /> },
  { label: "organizations", href: "/superadmin/orgs", icon: <Building2 size={16} /> },
  { label: "systemConfiguration", href: "/superadmin/config", icon: <Settings2 size={16} /> },
];

/**
 * Platform super-admin console — gated to `isSuperadmin` (root account only).
 * The dashboard layout above already wrapped us in RequireAuth + UserProvider,
 * so the resolved role is available here; unknown/failed roles fail closed.
 */
export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { isSuperadmin, loading } = useUser();
  const t = useTranslations("superadmin.layout");
  const pathname = usePathname();
  const router = useRouter();

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
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-surface-400 mt-1">
          {t("subtitle")}
      </p>
      </div>

      <div className="flex gap-1 p-1 card-base w-fit">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/superadmin/orgs"
              ? pathname.startsWith("/superadmin/orgs")
              : pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-surface-400 hover:text-white hover:bg-surface-800",
              )}
            >
              {tab.icon}
              {t(tab.label)}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
