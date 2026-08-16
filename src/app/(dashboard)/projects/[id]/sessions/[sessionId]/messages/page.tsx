"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  MessageSquare,
  User,
  Bot,
  Loader2,
  AlertCircle,
  ChevronUp,
  Clock,
  Hash,
  ArrowUp,
} from "lucide-react";
import { cn, smartTimestamp } from "@/lib/utils";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import SessionTabs from "../tabs";
import { PageGuide, GuideConversation } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { BlobCard, type BlobCardData } from "@/components/shared/blob-card";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id?: string;
  role: string;
  content: string;
  created_at?: string;
  token_count?: number;
  blobs?: BlobCardData[];
  [key: string]: unknown;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isUserMessage(role: string): boolean {
  return role === "user";
}

function isAssistantMessage(role: string): boolean {
  return role === "assistant";
}

function isSystemOrTool(role: string): boolean {
  return role === "system" || role === "tool";
}

function RoleIcon({ role }: { role: string }) {
  if (isUserMessage(role)) return <User size={14} />;
  if (isAssistantMessage(role)) return <Bot size={14} />;
  return <MessageSquare size={14} />;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const t = useTranslations("sessions.messages");
  const locale = useLocale();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project, loading: projectLoading } = useProject();
  const projectId = project?.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadOlderLoading, setLoadOlderLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  const fetchMessages = useCallback(
    async (limit: number, prepend: boolean = false) => {
      if (!projectId || !sessionId) return;

      const setLoadingFn = prepend ? setLoadOlderLoading : setLoading;
      setLoadingFn(true);
      setError(null);

      try {
        const json = await get<{ data: Message[] }>(
          `/v1/projects/${projectId}/sessions/${sessionId}/messages?limit=${limit}`,
        );
        const items: Message[] = json.data ?? [];
        const msgList: Message[] = Array.isArray(items) ? items : [];

        if (prepend) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id ?? m.content));
            const newItems = msgList.filter((m) => !existingIds.has(m.id ?? m.content));
            return [...newItems, ...prev];
          });
          if (msgList.length < limit) setAllLoaded(true);
        } else {
          const sorted = [...msgList].sort(
            (a, b) =>
              new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
          );
          setMessages(sorted);
          setAllLoaded(msgList.length < limit);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
      } finally {
        setLoadingFn(false);
      }
    },
    [projectId, sessionId, t],
  );

  // Initial load
  useEffect(() => {
    if (!projectId || !sessionId) {
      setLoading(false);
      return;
    }
    initialScrollDone.current = false;
    fetchMessages(100, false);
  }, [projectId, sessionId, fetchMessages]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    }
  }, [loading, messages.length]);

  // Load older
  const handleLoadOlder = () => {
    if (loadOlderLoading || allLoaded) return;
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    fetchMessages(messages.length + 100, true).then(() => {
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - prevScrollHeight;
        }
      });
    });
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (!projectId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-surface-400 mt-1">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title={t("noProjectTitle")}
          description={t("noProjectDescription")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SessionTabs sessionId={sessionId} activeTab="messages" />
      <PageGuide title={t("guideTitle")} illustration={<GuideConversation />}>
        <p>{t("guideBody")}</p>
      </PageGuide>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-surface-400 mt-1">
            {t("sessionLabel")}{" "}
            <span className="font-mono text-surface-300 text-xs" title={sessionId}>
              {sessionId.slice(0, 8)}…
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={scrollToBottom}
          className="flex items-center gap-1"
          title={t("scrollToBottom")}
        >
          <ArrowUp size={14} className="rotate-180" />
          {t("latest")}
        </Button>
      </div>

      {/* Messages container */}
      <div
        ref={scrollContainerRef}
        className="card-base overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 220px)", minHeight: "400px" }}
      >
        {/* Load older */}
        <div className="sticky top-0 z-10 flex justify-center py-3 bg-gradient-to-b from-surface-900 via-surface-900/95 to-transparent">
          {allLoaded ? (
            <span className="text-xs text-surface-500">{t("allLoaded")}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadOlder}
              disabled={loadOlderLoading}
            >
              {loadOlderLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  {t("loading")}
                </>
              ) : (
                <>
                  <ChevronUp size={14} />
                  {t("loadOlder")}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="animate-spin text-brand-300" />
            <span className="text-sm text-surface-400">{t("loadingMessages")}</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="mx-4 mt-2 mb-4">
            <ErrorState message={error} onRetry={() => fetchMessages(100, false)} />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && messages.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        )}

        {/* Message bubbles */}
        {!loading && messages.length > 0 && (
          <div className="px-4 pb-4 space-y-4">
            {messages.map((msg, idx) => {
              const isUser = isUserMessage(msg.role);
              const isAssistant = isAssistantMessage(msg.role);
              const isSysTool = isSystemOrTool(msg.role);

              if (isSysTool) {
                return (
                  <div key={msg.id ?? idx} className="flex justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-surface-500 bg-surface-800/40 px-3 py-1.5 rounded-full max-w-lg">
                      <RoleIcon role={msg.role} />
                      <span className="capitalize font-medium text-surface-400">{msg.role}</span>
                      <span className="text-surface-600 mx-0.5">·</span>
                      <span className="truncate">{msg.content}</span>
                      {msg.token_count !== undefined && (
                        <>
                          <span className="text-surface-600 mx-0.5">·</span>
                          <span title={t("tokens")}>{msg.token_count} tok</span>
                        </>
                      )}
                      {/* Attached files */}
                      {msg.blobs && msg.blobs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {msg.blobs.map((blob) => (
                            <BlobCard key={blob.id} blob={blob} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id ?? idx}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "px-3.5 py-2 text-sm leading-relaxed",
                        isUser
                          ? "bg-brand-500 text-white rounded-lg rounded-br-sm"
                          : "bg-surface-800 border border-surface-700 text-surface-100 rounded-lg rounded-bl-sm",
                      )}
                    >
                      {msg.content}
                      {isAssistant && msg.token_count !== undefined && (
                        <span className="ms-2 text-[11px] text-surface-500 font-mono inline-flex items-center gap-0.5">
                          <Hash size={10} />
                          {msg.token_count}
                        </span>
                      )}
                    </div>

                      {/* Attached files */}
                      {msg.blobs && msg.blobs.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {msg.blobs.map((blob) => (
                            <BlobCard key={blob.id} blob={blob} />
                          ))}
                        </div>
                      )}

                    <div
                      className={cn(
                        "flex items-center gap-2 text-[11px] text-surface-500 px-1",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      {msg.created_at && (
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />
                          {smartTimestamp(msg.created_at, locale)}
                        </span>
                      )}
                      {isUser && msg.token_count !== undefined && (
                        <span className="flex items-center gap-0.5" title={t("tokens")}>
                          <Hash size={10} />
                          {msg.token_count}
                        </span>
                      )}
                      <span className="capitalize text-surface-600">{msg.role}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
