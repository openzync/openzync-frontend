"use client";

import { useParams } from "next/navigation";
import { Database } from "lucide-react";
import { listSessionExtractions } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import { useApiQuery } from "@/hooks/use-api-query";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeleton } from "@/components/shared/skeleton";

export default function SessionExtractionsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;

  // Race-safe + abortable: only the latest run commits state, and a
  // refreshKey change/unmount cancels the in-flight fetch via AbortController.
  // Errors arrive via apiErrorMessage (hook normalizer). Data is kept during
  // refetch — skeleton/error show only when there is nothing to display.
  const query = useApiQuery(
    (signal) =>
      listSessionExtractions(projectId as string, sessionId, undefined, {
        signal,
      }),
    { enabled: Boolean(projectId && sessionId) },
  );
  const data = query.data?.items ?? [];

  return (
    <div>
      {query.isLoading && data.length === 0 ? (
        <TableSkeleton rows={2} cols={1} colWidths={["w-full"]} standalone />
      ) : query.error && data.length === 0 ? (
        <ErrorState message={query.error} onRetry={query.refetch} />
      ) : data.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No structured extractions found"
            description={"Configure a JSON Schema in Settings > Extraction Schemas.\nDefine one, then process new messages through the enrichment pipeline."}
          />
      ) : (
        <div className="space-y-3">
          {data.map((ext) => (
            <div key={ext.id} className="card-base p-4">
              <div className="text-xs text-surface-500 mb-2 font-mono">Schema: {ext.schema_id ?? "none"}</div>
              <pre className="text-sm font-mono text-surface-300 whitespace-pre-wrap bg-surface-950 p-3 rounded border border-surface-800 overflow-auto max-h-48">
                {JSON.stringify(ext.data, null, 2)}
              </pre>
              <div className="text-xs text-surface-600 mt-2">{new Date(ext.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
