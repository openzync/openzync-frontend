"use client";

import { usePathname } from "next/navigation";
import { PageGuide, GuideSettings } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useConfigDirty } from "@/contexts/config-dirty";
import { RequirePermission } from "@/components/shared/require-permission";

interface LabTab {
  label: string;
  href: string;
  id: string;
}

const TABS: LabTab[] = [
  // Exact path /settings/lab redirects to the Enrichment tab (page.tsx).
  { label: "Enrichment", href: "/settings/lab/enrichment", id: "enrichment" },
];

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <LabLayoutInner>{children}</LabLayoutInner>;
}

function LabLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const visibleTabs = TABS;
  // Tab switches route through the shared dirty guard — the ConfirmDialog
  // itself lives in ConfigDirtyProvider (mounted at the dashboard level).
  const { navigate } = useConfigDirty();

  function handleTabClick(href: string) {
    navigate(href);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Lab"
        description="Experimental features and enrichment gating"
      />

      <PageGuide title="Experimental features" illustration={<GuideSettings />}>
        <p>Experimental gates and upcoming feature switches live here. Anything you don&apos;t set falls back to system defaults.</p>
      </PageGuide>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 card-base w-fit flex-wrap">
        {visibleTabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = (tab as { icon?: React.ElementType }).icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.href)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-surface-400 hover:text-white hover:bg-surface-800",
              )}
            >
              {Icon ? <Icon size={14} className="shrink-0" /> : null}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content — reads /v1/me/config (personal overrides over
          system defaults), which the backend gates on configuration:read.
          Write actions stay gated in-page. */}
      <RequirePermission permission="configuration:read">{children}</RequirePermission>
    </div>
  );
}
