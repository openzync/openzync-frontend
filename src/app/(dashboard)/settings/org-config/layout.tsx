"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageGuide, GuideSettings } from "@/components/guides";
import { cn } from "@/lib/utils";
import { ConfigDirtyProvider, useConfigDirty } from "@/contexts/config-dirty";

export default function OrgConfigLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfigDirtyProvider>
      <OrgConfigLayoutInner>{children}</OrgConfigLayoutInner>
    </ConfigDirtyProvider>
  );
}

function OrgConfigLayoutInner({ children }: { children: React.ReactNode }) {
  const t = useTranslations("settings.orgConfig");
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty } = useConfigDirty();

  const TABS = [
    { label: t("tabs.organization"), href: "/settings/org-config", id: "organization" },
    { label: t("tabs.llm"), href: "/settings/org-config/llm", id: "llm" },
    { label: t("tabs.embeddings"), href: "/settings/org-config/embeddings", id: "embeddings" },
    { label: t("tabs.graph"), href: "/settings/org-config/graph", id: "graph" },
    { label: t("tabs.behaviour"), href: "/settings/org-config/behaviour", id: "behaviour" },
    { label: t("tabs.blobStorage"), href: "/settings/org-config/blob-storage", id: "blob-storage" },
  ];

  function handleTabClick(href: string) {
    if (isDirty && !confirm(t("discardConfirm"))) return;
    router.push(href);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-surface-400 mt-1">
          {t("subtitle")}
        </p>
      </div>

      <PageGuide title={t("guideTitle")} illustration={<GuideSettings />}>
        <p>{t("guideBody")}</p>
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
