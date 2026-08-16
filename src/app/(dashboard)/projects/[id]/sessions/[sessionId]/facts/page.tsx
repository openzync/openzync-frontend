"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { apiErrorMessage, get, post, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useProject } from "@/stores/project-context";
import { toast } from "sonner";
import SessionTabs from "../tabs";
import { PageGuide, GuideData } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton, TableSkeleton } from "@/components/shared/skeleton";

interface FactRow {
  id: string;
  content: string;
  subject: string | null;
  predicate: string | null;
  object: string | null;
  confidence: number;
  created_at: string;
  valid_to: string | null;
  invalid_at: string | null;
}

interface FactsResponse {
  data: FactRow[];
  next_cursor: string | null;
  has_more: boolean;
}

interface FactHistoryEvent {
  id: string;
  old_fact_id: string | null;
  new_fact_id: string | null;
  kind: "superseded" | "retracted";
  reason: string | null;
  at_time: string;
  source_episode_id: string | null;
}

interface FactHistoryResponse {
  fact: FactRow;
  events: FactHistoryEvent[];
}

function confidenceVariant(score: number): "success" | "warning" | "error" {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "warning";
  return "error";
}

export default function SessionFactsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;

  const [facts, setFacts] = useState<FactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Retract state
  const [retractTarget, setRetractTarget] = useState<FactRow | null>(null);
  const [retractReason, setRetractReason] = useState("");
  const [retracting, setRetracting] = useState(false);

  // History state
  const [historyTarget, setHistoryTarget] = useState<FactRow | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyData, setHistoryData] = useState<FactHistoryResponse | null>(null);

  const loadFacts = useCallback(
    async (showSpinner = true) => {
      if (!projectId) return;
      if (showSpinner) setLoading(true);
      setError("");
      try {
        const json = await get<FactsResponse>(
          `/v1/projects/${projectId}/sessions/${sessionId}/facts?limit=50`,
        );
        setFacts(json.data ?? []);
        setCursor(json.next_cursor ?? null);
        setHasMore(json.has_more ?? false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load facts");
        setFacts([]);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [projectId, sessionId],
  );

  useEffect(() => {
    loadFacts();
  }, [loadFacts]);

  async function loadMore() {
    if (!projectId || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const json = await get<FactsResponse>(
        `/v1/projects/${projectId}/sessions/${sessionId}/facts?limit=50&cursor=${encodeURIComponent(cursor)}`,
      );
      setFacts((prev) => [...prev, ...(json.data ?? [])]);
      setCursor(json.next_cursor ?? null);
      setHasMore(json.has_more ?? false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load more facts");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRetract() {
    if (!retractTarget || !projectId) return;
    setRetracting(true);
    try {
      await post(`/v1/projects/${projectId}/facts/${retractTarget.id}/retract`, {
        reason: retractReason.trim() || null,
      });
      toast.success("Fact retracted");
      setRetractTarget(null);
      setRetractReason("");
      await loadFacts(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to retract fact"));
    } finally {
      setRetracting(false);
    }
  }

  function cancelRetract() {
    setRetractTarget(null);
    setRetractReason("");
  }

  async function openHistory(fact: FactRow) {
    if (!projectId) return;
    setHistoryTarget(fact);
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryData(null);
    try {
      const json = await get<FactHistoryResponse>(
        `/v1/projects/${projectId}/facts/${fact.id}/history`,
      );
      setHistoryData(json);
    } catch (err) {
      setHistoryError(apiErrorMessage(err, "Failed to load fact history"));
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryTarget(null);
    setHistoryData(null);
    setHistoryError("");
  }

  return (
    <div>
      <SessionTabs sessionId={sessionId} activeTab="facts" />
      <PageGuide title="Extracted facts" illustration={<GuideData />}>
        <p>Facts are discrete pieces of information extracted from conversation messages — statements, attributes, and relationships about entities. Each fact is verified and stored in the knowledge graph.</p>
      </PageGuide>
      {loading ? (
        <TableSkeleton rows={5} cols={3} colWidths={["w-48", "w-32", "w-16"]} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : facts.length === 0 ? (
        <EmptyState icon={FileText} title="No facts extracted yet"
          description="Facts will appear here once the session is processed." />
      ) : (
        <div className="card-base overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-800 text-surface-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Content</th>
                <th className="px-4 py-3 text-left">Triple</th>
                <th className="px-4 py-3 text-center">Confidence</th>
                <th className="px-4 py-3 text-right">Extracted</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {facts.map((fact) => (
                <tr key={fact.id} className="even:bg-surface-950/50">
                  <td className="px-4 py-3 text-sm text-surface-200 max-w-xs truncate">{fact.content}</td>
                  <td className="px-4 py-3 text-sm text-surface-400">
                    {fact.subject && fact.predicate && fact.object
                      ? `${fact.subject} → ${fact.predicate} → ${fact.object}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={confidenceVariant(fact.confidence)} size="sm">
                      {(fact.confidence * 100).toFixed(0)}%
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-surface-400 whitespace-nowrap">
                    {formatDate(fact.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openHistory(fact)}>
                        History
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRetractTarget(fact);
                          setRetractReason("");
                        }}
                      >
                        Retract
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex justify-center py-4 border-t border-surface-800">
              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Retract confirm dialog ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!retractTarget}
        title="Retract fact"
        message={
          retractTarget
            ? `Are you sure you want to retract "${retractTarget.content}"? It will be removed from the facts list.`
            : ""
        }
        confirmLabel="Retract"
        variant="danger"
        loading={retracting}
        onConfirm={handleRetract}
        onCancel={cancelRetract}
      >
        <div className="mt-4">
          <label htmlFor="retract-reason" className="block text-sm font-medium text-surface-300 mb-1.5">
            Reason (optional)
          </label>
          <input
            id="retract-reason"
            type="text"
            value={retractReason}
            onChange={(e) => setRetractReason(e.target.value)}
            placeholder="Reason (optional)"
            className="input-base w-full"
            disabled={retracting}
          />
        </div>
      </ConfirmDialog>

      {/* ── History dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={!!historyTarget}
        onOpenChange={(open) => {
          if (!open) closeHistory();
        }}
        title="Fact history"
        size="lg"
      >
        {historyTarget && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-surface-200">{historyTarget.content}</p>
              <p className="text-sm text-surface-400 mt-1">
                {historyTarget.subject && historyTarget.predicate && historyTarget.object
                  ? `${historyTarget.subject} → ${historyTarget.predicate} → ${historyTarget.object}`
                  : "—"}
              </p>
            </div>
            {historyLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : historyError ? (
              <ErrorState
                message={historyError}
                onRetry={() => openHistory(historyTarget)}
              />
            ) : historyData && historyData.events.length === 0 ? (
              <p className="text-sm text-surface-400">No history events for this fact</p>
            ) : (
              <ul className="space-y-4">
                {historyData?.events.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3">
                    <Badge
                      variant={ev.kind === "retracted" ? "error" : "warning"}
                      size="sm"
                      className="mt-0.5 shrink-0"
                    >
                      {ev.kind === "retracted" ? "Retracted" : "Superseded"}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-xs text-surface-400">{formatDate(ev.at_time, true)}</p>
                      <p className="text-sm text-surface-200 mt-0.5">{ev.reason || "No reason given"}</p>
                      {ev.new_fact_id && (
                        <p className="text-xs text-surface-400 mt-0.5">
                          Replaced by fact {ev.new_fact_id}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}