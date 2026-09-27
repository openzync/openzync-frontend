"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  FolderKanban,
  Users,
  ArrowRight,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import {
  get,
  post,
  ApiError,
  apiErrorMessage,
  extractList,
} from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useApiQuery } from "@/hooks/use-api-query";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
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
  is_archived: boolean;
}

interface ProjectsApiResponse {
  data: Project[];
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  // show_archived lives in the URL — useSearchParams requires a Suspense
  // boundary during prerender (same pattern as overview/page.tsx).
  return (
    <Suspense fallback={null}>
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useUser();
  const canManage = can("project:manage");

  // URL is the source of truth — toggling replaces history without scrolling.
  const showArchived = searchParams.get("show_archived") === "1";

  function setShowArchived(on: boolean) {
    const p = new URLSearchParams(searchParams.toString());
    if (on) p.set("show_archived", "1");
    else p.delete("show_archived");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  const projectsQuery = useApiQuery<ProjectsApiResponse>(
    () =>
      get<ProjectsApiResponse>(
        showArchived ? "/v1/projects?include_archived=true" : "/v1/projects",
      ),
    { refreshKey: `${showArchived}` },
  );
  // Guarded: data is null until the first response lands.
  const projects = projectsQuery.data ? extractList<Project>(projectsQuery.data) : [];
  const loading = projectsQuery.isLoading;
  const fetchError = projectsQuery.error;

  const { togglePin, isPinned, isMaxPinned } = usePinnedProjects();

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Project name is required");
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
      toast.success(`Project "${project.name}" created`);
      router.push(`/projects/${project.id}/sessions`);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to create project",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleUnarchive(project: Project) {
    setUnarchivingId(project.id);
    try {
      await post(`/v1/projects/${project.id}/unarchive`);
      toast.success(`Project "${project.name}" restored`);
      projectsQuery.refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to restore project"));
    } finally {
      setUnarchivingId(null);
    }
  }

  return (
      <div className="space-y-6">
        <PageHeader
          title="Projects"
          description="Collaborative workspaces for memory and knowledge graph data"
          actions={
            <div className="flex items-center gap-3">
              <label
                htmlFor="show-archived"
                className="flex items-center gap-2 text-sm text-muted cursor-pointer"
              >
                <Switch
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                />
                Show archived
              </label>
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
                Create Project
              </Button>
            </div>
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
            <Button variant="secondary" size="sm" onClick={projectsQuery.refetch}>
              Retry
            </Button>
          </div>
        ) : projects.length === 0 ? (
          showArchived ? (
            <EmptyState
              icon={FolderKanban}
              title="No archived projects"
              description="Archived projects will appear here when they are archived."
            />
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start organising sessions, memory, and knowledge graphs."
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
                  Create Project
                </Button>
              }
            />
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) =>
              project.is_archived ? (
                <div
                  key={project.id}
                  aria-disabled="true"
                  className="card-base p-5 text-left opacity-60"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
                        <FolderKanban size={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate flex items-center gap-2">
                          <span className="truncate">{project.name}</span>
                          <Badge size="sm">Archived</Badge>
                        </h3>
                        {project.description && (
                          <p className="text-xs text-surface-500 truncate mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-surface-500">
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {project.member_count} member
                      {project.member_count !== 1 ? "s" : ""}
                    </span>
                    <span>Created {formatDate(project.created_at)}</span>
                  </div>
                  {canManage && (
                    <div className="mt-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={unarchivingId === project.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUnarchive(project);
                        }}
                      >
                        Unarchive
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={project.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/projects/${project.id}/sessions`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/projects/${project.id}/sessions`);
                    }
                  }}
                  className="card-interactive p-5 text-left group cursor-pointer"
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
                          void togglePin(project.id, project.name);
                        }}
                        disabled={isMaxPinned && !isPinned(project.id)}
                        title={
                          isPinned(project.id)
                            ? "Unpin project"
                            : isMaxPinned
                              ? "Maximum 3 pinned projects"
                              : "Pin project"
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
                      {project.member_count} member
                      {project.member_count !== 1 ? "s" : ""}
                    </span>
                    <span>Created {formatDate(project.created_at)}</span>
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {/* ── Create Dialog ──────────────────────────────────────────────── */}
        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            if (!open && !creating) setShowCreate(false);
          }}
          title="Create Project"
          persistent={creating}
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                loading={creating}
                disabled={!newName.trim()}
              >
                Create
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Name" htmlFor="project-name" required>
              <input
                id="project-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Customer Support Bot"
                className="input-base"
                autoFocus
                disabled={creating}
              />
            </Field>
            <Field label="Description" htmlFor="project-description">
              <textarea
                id="project-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description of this project"
                className="input-base min-h-[80px] resize-y"
                disabled={creating}
              />
            </Field>
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
