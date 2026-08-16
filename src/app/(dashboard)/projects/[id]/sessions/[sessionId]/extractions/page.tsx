"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Database } from "lucide-react";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import SessionTabs from "../tabs";
import { PageGuide, GuideData } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeleton } from "@/components/shared/skeleton";

interface Extraction {
  id: string;
  schema_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export default function SessionExtractionsPage() {
  const t = useTranslations("sessions.extractions");
  const fmt = useFormatter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;

  const [data, setData] = useState<Extraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const json = await get<{ items: Extraction[] }>(
          `/v1/projects/${projectId}/sessions/${sessionId}/structured-extractions`,
        );
        setData(json.items ?? []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, sessionId, t]);

  return (
    <div>
      <SessionTabs sessionId={sessionId} activeTab="extractions" />
      <PageGuide title={t("guideTitle")} illustration={<GuideData />}>
        <p>{t("guideBody")}</p>
      </PageGuide>
      {loading ? (
        <TableSkeleton rows={2} cols={1} colWidths={["w-full"]} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : data.length === 0 ? (
          <EmptyState
            icon={Database}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
      ) : (
        <div className="space-y-3">
          {data.map((ext) => (
            <div key={ext.id} className="card-base p-4">
              <div className="text-xs text-surface-500 mb-2 font-mono">{t("schemaLabel")}: {ext.schema_id ?? t("schemaNone")}</div>
              <pre className="text-sm font-mono text-surface-300 whitespace-pre-wrap bg-surface-950 p-3 rounded border border-surface-800 overflow-auto max-h-48">
                {JSON.stringify(ext.data, null, 2)}
              </pre>
              <div className="text-xs text-surface-600 mt-2">{fmt.dateTime(new Date(ext.created_at), { dateStyle: "medium", timeStyle: "short" })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
