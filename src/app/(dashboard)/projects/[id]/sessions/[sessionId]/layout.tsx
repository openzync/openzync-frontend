"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideConversation } from "@/components/guides";
import SessionTabs, { SESSION_TABS, type SessionTab } from "./tabs";
import { Badge } from "@/components/ui/badge";

interface SessionDetail {
  id: string;
  external_id: string;
  is_active: boolean;
}

/**
 * Stable shell for the whole session section: fetches the session once and
 * renders the header + tabs above every child page (overview landing + all
 * subtabs). Children never render their own PageHeader or SessionTabs.
 */
export default function SessionLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();

  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;

  // Bare session path is the overview — its href is "" so it never matches
  // the endsWith check below; it falls through to the default.
  const activeTab: SessionTab["id"] = (() => {
    for (const tab of SESSION_TABS) {
      if (tab.href !== "" && pathname.endsWith(`/${tab.href}`)) return tab.id;
    }
    return "overview";
  })();

  // Fetch session — useApiQuery keeps data during refetch and is race-safe.
  const sessionQuery = useApiQuery<SessionDetail>(async () => {
    try {
      return await get<SessionDetail>(
        `/v1/projects/${projectId}/sessions/${sessionId}`,
      );
    } catch (err) {
      // Preserve the detail page's friendly 404 copy through the hook's normalizer.
      if (err instanceof ApiError && err.isNotFound) {
        throw new Error("Session not found.");
      }
      throw err;
    }
  }, { enabled: Boolean(projectId && sessionId) });

  // SessionTabs already returns null without a projectId; the header falls
  // back to "Session" while loading — no loading guard, the shell is stable.
  const session = sessionQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={session?.external_id ?? "Session"}
        description="Session overview"
        actions={
          session ? (
            <Badge
              variant={session.is_active ? "success" : "default"}
              size="sm"
              live={session.is_active}
            >
              {session.is_active ? "Active" : "Closed"}
            </Badge>
          ) : undefined
        }
      />
      <PageGuide title="Session details" illustration={<GuideConversation />}>
        <p>View all data for a single session: messages, extracted facts, graph relationships, classifications, and structured extractions. Each tab shows a different aspect of the processed conversation.</p>
      </PageGuide>
      <SessionTabs sessionId={sessionId} activeTab={activeTab} />
      {children}
    </div>
  );
}
