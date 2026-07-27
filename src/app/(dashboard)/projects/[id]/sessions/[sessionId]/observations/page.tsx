"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import SessionTabs from "../tabs";
import { PageGuide, GuideData } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";

interface Observation {
  id: string;
  subject_entity_id: string;
  subject_entity_name: string | null;
  related_entity_id: string | null;
  related_entity_name: string | null;
  observation_type: string;
  content: string;
  confidence: number;
  supporting_fact_ids: string[] | null;
  supporting_relationship_ids: string[] | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

/** Map observation type to a badge variant and label. */
const typeConfig: Record<
  string,
  { label: string; variant: "brand" | "success" | "warning" | "default" }
> = {
  co_occurrence: { label: "Co-occurrence", variant: "brand" },
  temporal_pattern: { label: "Temporal Pattern", variant: "success" },
  behavioral_pattern: { label: "Behavioral Pattern", variant: "warning" },
};

export default function SessionObservationsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;

  const [data, setData] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const json = await get<{ data: Observation[] }>(
          `/v1/projects/${projectId}/observations`,
        );
        setData(json.data ?? []);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to load observations",
        );
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  return (
    <div>
      <SessionTabs sessionId={sessionId} activeTab="observations" />
      <PageGuide title="Observations" illustration={<GuideData />}>
        <p>Observations are insights derived from analyzing entity behavior across sessions — co-occurrence patterns, temporal sequences, and behavioral trends. They reveal how entities interact over time.</p>
      </PageGuide>
      {loading ? (
        <div className="divide-y divide-surface-800">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-4 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="No observations available yet"
          description="Observations are computed after enough messages have been processed. They will appear here once the background analysis completes."
        />
      ) : (
        <div className="divide-y divide-surface-800">
          {data.map((o) => {
            const tc =
              typeConfig[o.observation_type] ?? {
                label: o.observation_type,
                variant: "default" as const,
              };
            return (
              <div key={o.id} className="px-4 py-4 space-y-3">
                {/* Type badge + confidence */}
                <div className="flex items-center gap-3">
                  <Badge variant={tc.variant} size="sm">
                    {tc.label}
                  </Badge>
                  <Badge variant="brand" size="sm">
                    {(o.confidence * 100).toFixed(0)}%
                  </Badge>
                </div>

                {/* Content */}
                <p className="text-sm leading-relaxed text-surface-200 whitespace-pre-wrap break-words">
                  {o.content}
                </p>

                {/* Footer: date + entity names */}
                <div className="flex items-center justify-between text-xs text-surface-400">
                  <span>{new Date(o.created_at).toLocaleDateString()}</span>
                  {o.subject_entity_name && (
                    <span className="text-surface-500">
                      {o.related_entity_name
                        ? `${o.subject_entity_name} ↔ ${o.related_entity_name}`
                        : o.subject_entity_name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
