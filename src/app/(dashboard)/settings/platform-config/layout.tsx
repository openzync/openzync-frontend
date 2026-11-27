"use client";

import { usePathname } from "next/navigation";
import { PageGuide, GuideSettings } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useUser } from "@/contexts/user-context";
import { RequirePermission } from "@/components/shared/require-permission";

interface ConfigTab {
  label: string;
  href: string;
  id: string;
  /** Root/admin-only tab (platform console). */
  adminOnly?: boolean;
}

const TABS: ConfigTab[] = [
  // Exact path /settings/platform-config redirects to the LLM tab (page.tsx) —
  // no Overview entry; per-tab staged resets cover resets.
  { label: "LLM", href: "/settings/platform-config/llm", id: "llm" },
  { label: "Graph", href: "/settings/platform-config/graph", id: "graph" },
  { label: "Reranker", href: "/settings/platform-config/reranker", id: "reranker" },
  { label: "Enrichment", href: "/settings/platform-config/enrichment", id: "enrichment" },
  { label: "Behaviour", href: "/settings/platform-config/behaviour", id: "behaviour" },
  { label: "PII Protection", href: "/settings/platform-config/pii", id: "pii" },
  { label: "Registration", href: "/settings/platform-config/registration", id: "registration", adminOnly: true },
];

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  return <ConfigLayoutInner>{children}</ConfigLayoutInner>;
}

function ConfigLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin } = useUser();
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);
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
        title="Configuration"
        description="Manage settings for LLM, graph, reranking, and behaviour"
      />

      <PageGuide title="Personal configuration" illustration={<GuideSettings />}>
        <p>Configure your personal overrides for the LLM backend, graph database, reranking, and behaviour settings. Embeddings always run on a built-in local model (nomic-embed-text-v1.5, 768 dimensions) and need no configuration. Anything you don&apos;t set falls back to system defaults; your overrides take precedence for your own usage across all projects.</p>
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

      {/* Active tab content — every sub-tab reads /v1/me/config (personal
          overrides over system defaults), which the
          backend gates on configuration:read. Write actions stay gated in-page. */}
      <RequirePermission permission="configuration:read">{children}</RequirePermission>
    </div>
  );
}
