"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { get, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useProject } from "@/stores/project-context";
import { toast } from "sonner";
import SessionTabs from "../tabs";
import { PageGuide, GuideData } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/skeleton";

interface FactRow {
  id: string;
  content: string;
  subject: string | null;
  predicate: string | null;
  object: string | null;
  confidence: number;
  created_at: string;
}

interface FactsResponse {
  data: FactRow[];
  next_cursor: string | null;
  has_more: boolean;
}

function confidenceVariant(score: number): "success" | "warning" | "error" {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "warning";
  return "error";
}

export default function SessionFactsPage() {
  const t = useTranslations("sessions.facts");
  const locale = useLocale();
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

  useEffect(() => {
    if (!projectId) return;
    async function fetchFacts() {
      setLoading(true);
      setError("");
      try {
        const json = await get<FactsResponse>(
          `/v1/projects/${projectId}/sessions/${sessionId}/facts?limit=50`,
        );
        setFacts(json.data ?? []);
        setCursor(json.next_cursor ?? null);
        setHasMore(json.has_more ?? false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
        setFacts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchFacts();
  }, [projectId, sessionId, t]);

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
      toast.error(err instanceof ApiError ? err.message : t("loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <SessionTabs sessionId={sessionId} activeTab="facts" />
      <PageGuide title={t("guideTitle")} illustration={<GuideData />}>
        <p>{t("guideBody")}</p>
      </PageGuide>
      {loading ? (
        <TableSkeleton rows={5} cols={3} colWidths={["w-48", "w-32", "w-16"]} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : facts.length === 0 ? (
        <EmptyState icon={FileText} title={t("emptyTitle")}
          description={t("emptyDescription")} />
      ) : (
        <div className="card-base overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-800 text-surface-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">{t("table.content")}</th>
                <th className="px-4 py-3 text-left">{t("table.triple")}</th>
                <th className="px-4 py-3 text-center">{t("table.confidence")}</th>
                <th className="px-4 py-3 text-right">{t("table.extracted")}</th>
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
                    {formatDate(fact.created_at, false, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex justify-center py-4 border-t border-surface-800">
              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                {t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
