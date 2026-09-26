"use client";

import { useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionMessages } from "../session-messages";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const handleScrollReady = useCallback((fn: () => void) => {
    scrollToBottomRef.current = fn;
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scrollToBottomRef.current?.()}
          className="flex items-center gap-1"
          title="Scroll to bottom"
        >
          <ArrowUp size={14} className="rotate-180" />
          Latest
        </Button>
      </div>
      <SessionMessages sessionId={sessionId} embedded onScrollReady={handleScrollReady} />
    </div>
  );
}
