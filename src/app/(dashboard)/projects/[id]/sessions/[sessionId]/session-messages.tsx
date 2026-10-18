"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  sequence_number?: number;
  blobs?: BlobCardData[];
  [key: string]: unknown;
}

interface MessagesResponse {
  data: Message[];
  next_cursor?: string | null;
  has_more?: boolean;
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

/**
 * Collision-safe dedup key for messages. Uses the backend id when present;
 * otherwise hashes role + content + sequence_number so two distinct id-less
 * messages with identical text don't collapse into one.
 */
function messageKey(m: Message): string {
  if (m.id) return m.id;
  const raw = `${m.role}|${m.content}|${m.sequence_number ?? ""}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return `hash:${(hash >>> 0).toString(36)}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * The message list for a session — fetches, paginates backwards, and renders
 * chat bubbles. Shared by the Messages subtab page (full chrome) and the
 * session detail page, where it is the default landing tab (`embedded`).
 *
 * Pagination uses the backend's keyset cursor (`next_cursor`/`has_more`) to
 * load older messages without re-transferring the already-loaded prefix.
 * Initial load fetches the most recent page; "Load older" walks backward
 * through history one page at a time.
 */
export function SessionMessages({
  sessionId,
  embedded = false,
  onScrollReady,
}: {
  sessionId: string;
  /** Embedded in the session detail page — skips the redundant page heading. */
  embedded?: boolean;
  /** Receives the scroll-to-bottom fn so a parent header can trigger it. */
  onScrollReady?: (scrollToBottom: () => void) => void;
}) {
  const { project, loading: projectLoading } = useProject();
  const projectId = project?.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadOlderLoading, setLoadOlderLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  const fetchMessages = useCallback(
    async (cursor: string | null = null) => {
      if (!projectId || !sessionId) return;

      const isInitial = cursor === null;
      const setLoadingFn = isInitial ? setLoading : setLoadOlderLoading;
      setLoadingFn(true);
      setError(null);

      try {
        const params = new URLSearchParams({ limit: "100", sort_dir: "desc" });
        if (cursor) params.set("cursor", cursor);
        const json = await get<MessagesResponse>(
          `/v1/projects/${projectId}/sessions/${sessionId}/messages?${params}`,
        );
        const items: Message[] = json.data ?? [];
        const msgList: Message[] = Array.isArray(items) ? items : [];

        if (isInitial) {
          // Backend returns DESC (newest first); sort ASC for display.
          const sorted = [...msgList].sort(
            (a, b) =>
              (a.sequence_number ?? 0) - (b.sequence_number ?? 0),
          );
          setMessages(sorted);
        } else {
          setMessages((prev) => {
            const existing = new Set(prev.map(messageKey));
            const newItems = msgList.filter((m) => !existing.has(messageKey(m)));
            return [...newItems, ...prev].sort(
              (a, b) =>
                (a.sequence_number ?? 0) - (b.sequence_number ?? 0),
            );
          });
        }
        setNextCursor(json.next_cursor ?? null);
        setAllLoaded(!json.has_more);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load messages");
      } finally {
        setLoadingFn(false);
      }
    },
    [projectId, sessionId],
  );

  // Initial load
  useEffect(() => {
    if (!projectId || !sessionId) {
      setLoading(false);
      return;
    }
    initialScrollDone.current = false;
    setNextCursor(null);
    setAllLoaded(false);
    fetchMessages(null);
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
    if (loadOlderLoading || allLoaded || !nextCursor) return;
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    fetchMessages(nextCursor).then(() => {
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - prevScrollHeight;
        }
      });
    });
  };

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    onScrollReady?.(scrollToBottom);
  }, [scrollToBottom, onScrollReady]);

  if (!projectId && !projectLoading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No project selected"
        description="Select a project to view messages."
      />
    );
  }

  return (
    <div className="space-y-4">
      {embedded && !onScrollReady && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={scrollToBottom}
            className="flex items-center gap-1"
            title="Scroll to bottom"
          >
            <ArrowUp size={14} className="rotate-180" />
            Latest
          </Button>
        </div>
      )}

      {/* Messages container */}
      <div
        ref={scrollContainerRef}
        className="card-base overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 220px)", minHeight: "400px" }}
      >
        {/* Load older */}
        <div className="sticky top-0 z-10 flex justify-center py-3 bg-gradient-to-b from-surface-900 via-surface-900/95 to-transparent">
          {allLoaded ? (
            <span className="text-xs text-surface-500">All messages loaded</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadOlder}
              disabled={loadOlderLoading || !nextCursor}
            >
              {loadOlderLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronUp size={14} />
                  Load older messages
                </>
              )}
            </Button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="animate-spin text-brand-300" />
            <span className="text-sm text-surface-400">Loading messages...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="mx-4 mt-2 mb-4">
            <ErrorState message={error} onRetry={() => fetchMessages(null)} />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && messages.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="No messages in this session yet"
            description="Messages will appear once the conversation starts."
          />
        )}

        {/* Message bubbles */}
        {!loading && messages.length > 0 && (
          <div className="px-4 pb-4 space-y-4">
            {messages.map((msg) => {
              const isUser = isUserMessage(msg.role);
              const isAssistant = isAssistantMessage(msg.role);
              const isSysTool = isSystemOrTool(msg.role);
              const key = messageKey(msg);

              if (isSysTool) {
                return (
                  <div key={key} className="flex justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-surface-500 bg-surface-800/40 px-3 py-1.5 rounded-full max-w-lg">
                      <RoleIcon role={msg.role} />
                      <span className="capitalize font-medium text-surface-400">{msg.role}</span>
                      <span className="text-surface-600 mx-0.5">&middot;</span>
                      <span className="truncate">{msg.content}</span>
                      {msg.token_count !== undefined && (
                        <>
                          <span className="text-surface-600 mx-0.5">&middot;</span>
                          <span title="Tokens">{msg.token_count} tok</span>
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
                  key={key}
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
                        <span className="ml-2 text-[11px] text-surface-500 font-mono inline-flex items-center gap-0.5">
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
                          {smartTimestamp(msg.created_at)}
                        </span>
                      )}
                      {isUser && msg.token_count !== undefined && (
                        <span className="flex items-center gap-0.5" title="Tokens">
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
