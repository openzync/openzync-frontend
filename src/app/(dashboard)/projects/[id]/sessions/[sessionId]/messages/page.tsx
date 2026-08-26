"use client";

import { useParams } from "next/navigation";
import SessionTabs from "../tabs";
import { PageGuide, GuideConversation } from "@/components/guides";
import { SessionMessages } from "../session-messages";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return (
    <div className="space-y-4">
      <SessionTabs sessionId={sessionId} activeTab="messages" />
      <PageGuide title="Conversation messages" illustration={<GuideConversation />}>
        <p>Browse all messages in this session in chronological order. Messages are the raw input that the enrichment pipeline processes to extract entities, facts, classifications, and structured data.</p>
      </PageGuide>
      <SessionMessages sessionId={sessionId} />
    </div>
  );
}
