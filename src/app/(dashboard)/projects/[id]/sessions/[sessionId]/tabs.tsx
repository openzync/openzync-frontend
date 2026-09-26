"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject } from "@/stores/project-context";

export interface SessionTab {
  id: "overview" | "messages" | "facts" | "graph" | "classifications" | "extractions" | "observations";
  label: string;
  href: string;
}

/** Single source of truth for session subtabs — used by the detail page and every subtab page. */
export const SESSION_TABS: SessionTab[] = [
  { id: "overview", label: "Overview", href: "" },
  { id: "messages", label: "Messages", href: "messages" },
  { id: "facts", label: "Facts", href: "facts" },
  { id: "graph", label: "Graph", href: "graph" },
  { id: "classifications", label: "Classifications", href: "classifications" },
  { id: "extractions", label: "Extractions", href: "extractions" },
  { id: "observations", label: "Observations", href: "observations" },
];

interface SessionTabsProps {
  sessionId: string;
  /** Currently active tab id — the layout always resolves one ("overview" for the bare path). */
  activeTab: SessionTab["id"] | null;
}

function hrefForId(id: SessionTab["id"]): string {
  return SESSION_TABS.find((tab) => tab.id === id)?.href ?? id;
}

export default function SessionTabs({ sessionId, activeTab }: SessionTabsProps) {
  const { project } = useProject();
  const router = useRouter();
  const projectId = project?.id;

  if (!projectId) return null;

  return (
    <Tabs
      variant="pill"
      value={activeTab ?? ""}
      onValueChange={(id) => {
        // Overview lives at the bare session path — no trailing suffix.
        const href = hrefForId(id as SessionTab["id"]);
        router.push(
          href === ""
            ? `/projects/${projectId}/sessions/${sessionId}`
            : `/projects/${projectId}/sessions/${sessionId}/${href}`,
        );
      }}
    >
      <TabsList>
        {SESSION_TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
