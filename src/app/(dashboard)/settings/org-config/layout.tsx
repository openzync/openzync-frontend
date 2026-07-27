"use client";

import { usePathname, useRouter } from "next/navigation";
import { PageGuide, GuideSettings } from "@/components/guides";
import { cn } from "@/lib/utils";
import { ConfigDirtyProvider, useConfigDirty } from "@/contexts/config-dirty";

const TABS = [
  { label: "LLM", href: "/settings/org-config/llm", id: "llm" },
  { label: "Embeddings", href: "/settings/org-config/embeddings", id: "embeddings" },
  { label: "Graph", href: "/settings/org-config/graph", id: "graph" },
  { label: "Behaviour", href: "/settings/org-config/behaviour", id: "behaviour" },
  { label: "Blob Storage", href: "/settings/org-config/blob-storage", id: "blob-storage" },
];

export default function OrgConfigLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfigDirtyProvider>
      <OrgConfigLayoutInner>{children}</OrgConfigLayoutInner>
    </ConfigDirtyProvider>
  );
}

function OrgConfigLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty } = useConfigDirty();

  function handleTabClick(href: string) {
    if (isDirty && !confirm("You have unsaved changes. Discard them and leave?")) return;
    router.push(href);
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
      <div className="flex gap-1 p-1 card-base w-fit">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.href)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
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

      {/* Active tab content */}
      {children}
    </div>
  );
}
