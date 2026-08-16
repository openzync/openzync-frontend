"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Tags } from "lucide-react";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import SessionTabs from "../tabs";
import { PageGuide, GuideData } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";

interface Classification {
  id: string;
  episode_id: string;
  intent: string | null;
  emotion: string | null;
  valence: string | null;
  arousal: string | null;
  confidence: number;
  message: string;
  role: string;
  created_at: string;
}

/** Map role string to Badge variant. */
const roleVariant = (
  role: string,
): "default" | "success" | "brand" | "warning" => {
  switch (role) {
    case "user":
      return "brand";
    case "assistant":
      return "success";
    case "tool":
      return "warning";
    default:
      return "default";
  }
};

/** Render a nullable value — shows the value or an em-dash in surface-500. */
function NullableValue({ value }: { value: string | null }) {
  return value != null ? (
    <span className="text-surface-200">{value}</span>
  ) : (
    <span className="text-surface-500">&mdash;</span>
  );
}

export default function SessionClassificationsPage() {
  const t = useTranslations("sessions.classifications");
  const fmt = useFormatter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;

  const [data, setData] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!projectId) return;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const json = await get<{ data: Classification[] }>(
          `/v1/projects/${projectId}/sessions/${sessionId}/classifications`,
        );
        setData(json.data ?? []);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : t("loadFailed"),
        );
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, sessionId, t]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div>
      <SessionTabs sessionId={sessionId} activeTab="classifications" />
      <PageGuide title={t("guideTitle")} illustration={<GuideData />}>
        <p>{t("guideBody")}</p>
      </PageGuide>
      {loading ? (
        <div className="divide-y divide-surface-800">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-4 space-y-3">
              <Skeleton className="h-16 w-full" />
              <div className="flex flex-wrap gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="divide-y divide-surface-800">
          {data.map((c) => (
            <div key={c.id} className="px-4 py-4 space-y-3">
              <div className="text-sm leading-relaxed text-surface-200 whitespace-pre-wrap break-words">
                {expanded[c.id] || c.message.length <= 200
                  ? c.message
                  : c.message.slice(0, 200)}
                {c.message.length > 200 && (
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="text-brand-400 hover:text-brand-300 text-xs ms-1"
                  >
                    {expanded[c.id] ? t("showLess") : t("readMore")}
                  </button>
                )}
              </div>

              {/* Metadata: Role + Intent + Emotion + Valence + Arousal */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-surface-400">
                <Badge variant={roleVariant(c.role)} size="sm">
                  {c.role}
                </Badge>
                <span>
                  {t("meta.intent")}: <NullableValue value={c.intent} />
                </span>
                <span>
                  {t("meta.emotion")}: <NullableValue value={c.emotion} />
                </span>
                <span>
                  {t("meta.valence")}: <NullableValue value={c.valence} />
                </span>
                <span>
                  {t("meta.arousal")}: <NullableValue value={c.arousal} />
                </span>
              </div>

              {/* Confidence + Date */}
              <div className="flex items-center justify-between">
                <Badge variant="brand">
                  {(c.confidence * 100).toFixed(0)}%
                </Badge>
                <span className="text-xs text-surface-400">
                  {fmt.dateTime(new Date(c.created_at), { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
