"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Plus,
  Eye,
  Trash2,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { get, post, del as apiDel, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useProject } from "@/stores/project-context";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideConversation } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  user_id: string;
  external_id: string;
  is_active: boolean;
  message_count: number;
  fact_count: number;
  created_at: string;
  closed_at?: string;
}

interface SessionsApiResponse {
  data: Session[];
  next_cursor: string | null;
  has_more: boolean;
  total: number | null;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectSessionsPage() {
  const t = useTranslations("sessions.list");
  const common = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const { project, loading: projectLoading } = useProject();
  const projectId = project?.id;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newExternalId, setNewExternalId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch sessions ────────────────────────────────────────────────────────

  const fetchSessions = useCallback(
    async (cursorVal: string | null) => {
      if (!projectId) return;
      const isInitial = !cursorVal;
      if (isInitial) { setLoading(true); setFetchError(""); }
      else { setLoadingMore(true); }

      try {
        let url = `/v1/projects/${projectId}/sessions?limit=50&include_closed=true`;
        if (cursorVal) url += `&cursor=${encodeURIComponent(cursorVal)}`;
        const json = await get<SessionsApiResponse>(url);
        const items = json.data ?? [];
        if (isInitial) { setSessions(items); }
        else { setSessions((prev) => [...prev, ...items]); }
        setCursor(json.next_cursor ?? null);
        setHasMore(json.has_more ?? false);
      } catch (err) {
        if (isInitial) {
          setFetchError(
            err instanceof ApiError ? err.message : t("loadError"),
          );
          setSessions([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [projectId, t],
  );

  useEffect(() => {
    if (projectId) fetchSessions(null);
  }, [projectId, fetchSessions]);

  // ── Create session ────────────────────────────────────────────────────────

  async function handleCreateSession() {
    const trimmedId = newExternalId.trim();
    if (!trimmedId) { setCreateError(t("externalIdRequired")); return; }
    setCreating(true); setCreateError("");
    try {
      await post(`/v1/projects/${projectId}/sessions`, { external_id: trimmedId });
      setShowCreateDialog(false);
      setNewExternalId("");
      toast.success(t("createdToast", { id: trimmedId }));
      fetchSessions(null);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : t("networkError"),
      );
    } finally { setCreating(false); }
  }

  // ── Delete session ────────────────────────────────────────────────────────

  async function handleDeleteSession() {
    if (!deleteTarget || !projectId) return;
    setDeleting(true);
    try {
      await apiDel(`/v1/projects/${projectId}/sessions/${deleteTarget.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(t("deletedToast", { id: deleteTarget.external_id }));
    } catch {
      toast.error(t("deleteFailed"));
    } finally { setDeleting(false); }
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (projectLoading) {
    return (
        <div className="space-y-6">
          <PageHeader title={t("title")} description={t("loadingProject")} />
        </div>
    );
  }

  if (!projectId) {
    return (
        <div className="card-base p-12 flex flex-col items-center justify-center">
          <AlertTriangle size={36} className="text-error mb-3" />
          <p className="text-sm text-surface-300">{t("projectNotFound")}</p>
        </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={project ? t("subtitle", { name: project.name }) : t("subtitleGeneric")}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => {
            setNewExternalId(""); setCreateError(""); setShowCreateDialog(true);
          }}>
            {t("createSession")}
          </Button>
        }
      />

      <PageGuide title={t("guideTitle")} illustration={<GuideConversation />}>
        <p>{t("guideBody")}</p>
      </PageGuide>

      {/* Sessions table */}
      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} cols={6} colWidths={["w-32", "w-16", "w-12", "w-12", "w-28", "w-16"]} />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <AlertTriangle size={36} className="text-error mb-3" />
            <p className="text-sm text-surface-300 mb-1">{fetchError}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchSessions(null)}>{common("retry")}</Button>
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={<Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => {
              setNewExternalId(""); setCreateError(""); setShowCreateDialog(true);
            }}>{t("createSession")}</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-800">
                    <th className="text-left text-xs font-medium text-surface-400 px-4 py-3">{t("table.externalId")}</th>
                    <th className="text-left text-xs font-medium text-surface-400 px-4 py-3">{t("table.status")}</th>
                    <th className="text-center text-xs font-medium text-surface-400 px-4 py-3">{t("table.messages")}</th>
                    <th className="text-center text-xs font-medium text-surface-400 px-4 py-3">{t("table.facts")}</th>
                    <th className="text-left text-xs font-medium text-surface-400 px-4 py-3">{t("table.created")}</th>
                    <th className="text-right text-xs font-medium text-surface-400 px-4 py-3">{t("table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {sessions.map((session) => (
                    <tr key={session.id} className="transition-colors hover:bg-surface-800/50">
                      <td className="px-4 py-3 text-surface-100 font-medium">{session.external_id}</td>
                      <td className="px-4 py-3">
                        <Badge variant={session.is_active ? "success" : "default"} size="sm">
                          <span className={`me-1.5 h-1.5 w-1.5 rounded-full inline-block ${session.is_active ? "bg-success" : "bg-surface-500"}`} />
                          {session.is_active ? t("status.active") : t("status.closed")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-surface-300">{session.message_count}</td>
                      <td className="px-4 py-3 text-center text-surface-300">{session.fact_count}</td>
                      <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{formatDate(session.created_at, false, locale)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/projects/${projectId}/sessions/${session.id}`)}
                            className="p-1.5" title={t("viewSession")}><Eye size={15} /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(session)}
                            className="text-surface-400 hover:text-error" title={t("deleteSession")}><Trash2 size={15} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="flex justify-center py-4 border-t border-surface-800">
                <Button variant="secondary" size="sm" onClick={() => fetchSessions(cursor)} loading={loadingMore}>
                  {t("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create Session Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open && !creating) setShowCreateDialog(false);
        }}
        title={t("createSession")}
        persistent={creating}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowCreateDialog(false)} disabled={creating}>{common("cancel")}</Button>
            <Button variant="primary" size="sm" onClick={handleCreateSession} loading={creating} disabled={!newExternalId.trim()}>{t("create")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">{t("externalIdLabel")} <span className="text-error">*</span></label>
            <input type="text" value={newExternalId} onChange={(e) => setNewExternalId(e.target.value)}
              placeholder={t("externalIdPlaceholder")} className="input-base w-full" autoFocus disabled={creating} />
            <p className="text-xs text-surface-500 mt-1">{t("externalIdHint")}</p>
          </div>
          {createError && (
            <div className="rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">{createError}</div>
          )}
        </div>
      </Dialog>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("deleteSession")}
        message={t("deleteConfirm", { id: deleteTarget?.external_id ?? "" })}
        confirmLabel={t("delete")}
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
