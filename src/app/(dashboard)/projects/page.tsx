"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Plus,
  FolderKanban,
  Users,
  ArrowRight,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { get, post, ApiError, extractList } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";


// ─── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProjectsApiResponse {
  data: Project[];
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const common = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const { togglePin, isPinned, isMaxPinned } = usePinnedProjects();

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const json = await get<ProjectsApiResponse>("/v1/projects");
      setProjects(extractList<Project>(json));
    } catch (err) {
      setFetchError(
        err instanceof ApiError ? err.message : t("loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError(t("nameRequired"));
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const body: Record<string, unknown> = { name };
      if (newDescription.trim()) body.description = newDescription.trim();
      const project = await post<Project>("/v1/projects", body);
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      toast.success(t("createdToast", { name: project.name }));
      router.push(`/projects/${project.id}/sessions`);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : t("createFailed"),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
      <div className="space-y-6">
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => {
                setNewName("");
                setNewDescription("");
                setCreateError("");
                setShowCreate(true);
              }}
            >
              {t("createProject")}
            </Button>
          }
        />

        {/* Project grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-base p-6 h-40 animate-pulse">
                <div className="h-5 w-32 bg-surface-800 rounded mb-3" />
                <div className="h-3 w-full bg-surface-800 rounded mb-2" />
                <div className="h-3 w-3/4 bg-surface-800 rounded" />
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="card-base p-12 flex flex-col items-center justify-center">
            <AlertTriangle size={36} className="text-error mb-3" />
            <p className="text-sm text-surface-300 mb-4">{fetchError}</p>
            <Button variant="secondary" size="sm" onClick={fetchProjects}>
              {common("retry")}
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => {
                  setNewName("");
                  setNewDescription("");
                  setCreateError("");
                  setShowCreate(true);
                }}
              >
                {t("createProject")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}/sessions`)}
                className="card-interactive p-5 text-left group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
                      <FolderKanban size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-xs text-surface-500 truncate mt-0.5">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 mt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(project.id, project.name);
                      }}
                      disabled={isMaxPinned && !isPinned(project.id)}
                      title={
                        isPinned(project.id)
                          ? t("unpinProject")
                          : isMaxPinned
                            ? t("maxPinned")
                            : t("pinProject")
                      }
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <MapPin
                        size={15}
                        className={
                          isPinned(project.id)
                            ? "text-brand-400 fill-brand-400"
                            : "text-surface-500"
                        }
                      />
                    </button>
                    <ArrowRight
                      size={16}
                      className="text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-surface-500">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {t("membersCount", { count: project.member_count })}
                  </span>
                  <span>{t("created", { date: formatDate(project.created_at, false, locale) })}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Create Dialog ──────────────────────────────────────────────── */}
        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            if (!open && !creating) setShowCreate(false);
          }}
          title={t("createProject")}
          persistent={creating}
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                {common("cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                loading={creating}
                disabled={!newName.trim()}
              >
                {t("create")}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                {t("nameLabel")} <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="input-base"
                autoFocus
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                className="input-base min-h-[80px] resize-y"
                disabled={creating}
              />
            </div>
            {createError && (
              <div className="rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {createError}
              </div>
            )}
          </div>
        </Dialog>
      </div>
  );
}
