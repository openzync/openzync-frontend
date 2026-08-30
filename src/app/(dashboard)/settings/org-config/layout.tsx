"use client";

import { usePathname } from "next/navigation";
import { PageGuide, GuideSettings } from "@/components/guides";
import { cn } from "@/lib/utils";
import { useConfigDirty } from "@/contexts/config-dirty";
import { RequirePermission } from "@/components/shared/require-permission";

const TABS = [
  { label: "Organization", href: "/settings/org-config", id: "organization" },
  { label: "LLM", href: "/settings/org-config/llm", id: "llm" },
  { label: "Embeddings", href: "/settings/org-config/embeddings", id: "embeddings" },
  { label: "Graph", href: "/settings/org-config/graph", id: "graph" },
  { label: "Behaviour", href: "/settings/org-config/behaviour", id: "behaviour" },
  { label: "Blob Storage", href: "/settings/org-config/blob-storage", id: "blob-storage" },
  { label: "PII Protection", href: "/settings/org-config/pii", id: "pii" },
];

export default function OrgConfigLayout({ children }: { children: React.ReactNode }) {
  return <OrgConfigLayoutInner>{children}</OrgConfigLayoutInner>;
}

function OrgConfigLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Tab switches route through the shared dirty guard — the ConfirmDialog
  // itself lives in ConfigDirtyProvider (mounted at the dashboard level).
  const { navigate } = useConfigDirty();

  function handleTabClick(href: string) {
    navigate(href);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization Configuration</h1>
        <p className="text-sm text-surface-400 mt-1">
          Manage settings for LLM, embeddings, graph, and behaviour
        </p>
      </div>

      <PageGuide title="Organization configuration" illustration={<GuideSettings />}>
        <p>Configure your organization LLM backend, embedding models, graph database, behaviour settings, and blob storage. These settings control how the system processes, enriches, and stores data across all projects.</p>
      </PageGuide>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 card-base w-fit flex-wrap">
        {TABS.map((tab) => {
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

      {/* Active tab content — every sub-tab reads /admin/org/config, which the
          backend gates on configuration:read. Write actions stay gated in-page. */}
      <RequirePermission permission="configuration:read">{children}</RequirePermission>
    </div>
  );
}
