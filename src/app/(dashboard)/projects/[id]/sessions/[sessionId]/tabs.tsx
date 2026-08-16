"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useProject } from "@/stores/project-context";

interface SessionTabsProps {
  sessionId: string;
  activeTab: "messages" | "facts" | "graph" | "classifications" | "extractions" | "observations";
}

export default function SessionTabs({ sessionId, activeTab }: SessionTabsProps) {
  const t = useTranslations("sessions.detail.tabs");
  const { project } = useProject();
  const projectId = project?.id;

  if (!projectId) return null;

  const TABS = [
    { id: "messages", label: t("messages"), href: "messages" },
    { id: "facts", label: t("facts"), href: "facts" },
    { id: "graph", label: t("graph"), href: "graph" },
    { id: "classifications", label: t("classifications"), href: "classifications" },
    { id: "extractions", label: t("extractions"), href: "extractions" },
    { id: "observations", label: t("observations"), href: "observations" },
  ] as const;

  return (
    <div className="mb-4 border-b border-surface-800">
      <nav className="flex gap-0 -mb-px">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={`/projects/${projectId}/sessions/${sessionId}/${tab.href}`}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "text-brand-500 border-brand-500"
                  : "text-surface-400 border-transparent hover:text-surface-200 hover:border-surface-600",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
