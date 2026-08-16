"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Database, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { get, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Schema {
  id: string;
  name: string;
  type: string;
  json_schema: Record<string, unknown>;
  prompt_template: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── View Dialog ───────────────────────────────────────────────────────────────

function ViewDialog({ schema, onClose }: { schema: Schema; onClose: () => void }) {
  const t = useTranslations("settings.extractions");
  const locale = useLocale();
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={schema.name}
      size="lg"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>{t("close")}</Button>
      }
    >
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-surface-500 block">{t("view.type")}</span>
          <span className="text-sm text-surface-200 capitalize">{schema.type}</span>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">{t("view.created")}</span>
          <span className="text-sm text-surface-200">{formatDate(schema.created_at, false, locale)}</span>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">{t("view.status")}</span>
          <Badge variant={schema.is_active ? "success" : "default"} size="sm">{schema.is_active ? t("status.active") : t("status.inactive")}</Badge>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">{t("view.id")}</span>
          <span className="font-mono text-xs text-surface-400">{schema.id}</span>
        </div>
      </div>
      <div className="mb-4">
        <span className="text-xs font-medium text-surface-400 block mb-1.5">{t("view.jsonSchema")}</span>
        <div className="bg-surface-950 border border-surface-700 font-mono text-xs p-4 rounded overflow-x-auto max-h-64 overflow-y-auto">
          <pre className="text-surface-200 whitespace-pre">{JSON.stringify(schema.json_schema, null, 2)}</pre>
        </div>
      </div>
      {schema.prompt_template && (
        <div>
          <span className="text-xs font-medium text-surface-400 block mb-1.5">{t("view.promptTemplate")}</span>
          <div className="bg-surface-950 border border-surface-700 font-mono text-xs p-4 rounded overflow-x-auto max-h-40 overflow-y-auto">
            <pre className="text-surface-200 whitespace-pre-wrap">{schema.prompt_template}</pre>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ExtractionsPage() {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<Schema | null>(null);
  const t = useTranslations("settings.extractions");
  const locale = useLocale();

  const fetchSchemas = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<{ data: Schema[] }>("/v1/admin/schemas?type=structured");
      setSchemas(data.data ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("loadFailed"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSchemas(); }, [fetchSchemas]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      {error && <ErrorState message={error} onRetry={fetchSchemas} />}

      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-800">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("table.name")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("table.status")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("table.template")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("table.created")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-400">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {loading ? (
                <TableSkeleton rows={4} cols={5} colWidths={["w-36", "w-16", "w-12", "w-24", "w-12"]} />
              ) : schemas.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon={Database} title={t("emptyTitle")} description={t("emptyDescription")} /></td></tr>
              ) : (
                schemas.map((schema, idx) => (
                  <tr key={schema.id} className={cn("transition-colors hover:bg-surface-800/50", idx % 2 === 0 ? "bg-surface-950/50" : "")}>
                    <td className="px-4 py-3"><span className="font-medium text-white">{schema.name}</span></td>
                    <td className="px-4 py-3"><Badge variant={schema.is_active ? "success" : "default"} size="sm">{schema.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-4 py-3"><span className="text-xs text-surface-400">{schema.prompt_template ? t("yes") : "—"}</span></td>
                    <td className="px-4 py-3 text-surface-400 text-xs">{formatDate(schema.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setViewTarget(schema)} className="rounded-md text-surface-400 hover:text-white" title={t("viewSchema")}><Eye size={14} /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewTarget && <ViewDialog schema={viewTarget} onClose={() => setViewTarget(null)} />}
    </div>
  );
}
