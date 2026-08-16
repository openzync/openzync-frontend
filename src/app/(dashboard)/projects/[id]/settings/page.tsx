"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings, Save, Archive, AlertTriangle } from "lucide-react";
import { patch, del, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export default function ProjectSettingsPage() {
  const t = useTranslations("projects.settings");
  const router = useRouter();
  const { project, loading, refetch } = useProject();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
    }
  }, [project]);

  async function handleSave() {
    if (!name.trim() || !project) return;
    setSaving(true);
    setSaveError("");
    try {
      await patch(`/v1/projects/${project.id}`, {
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success(t("savedToast"));
      refetch();
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : t("saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!project) return;
    setArchiving(true);
    try {
      await del(`/v1/projects/${project.id}`);
      setShowArchiveConfirm(false);
      toast.success(t("archivedToast", { name: project.name }));
      router.push("/projects");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("archiveFailed"),
      );
    } finally {
      setArchiving(false);
    }
  }

  if (loading) {
    return (
        <div className="space-y-6">
          <PageHeader title={t("title")} description={t("loadingDescription")} />
          <div className="card-base p-6 space-y-4 animate-pulse">
            <div className="h-5 w-32 bg-surface-800 rounded" />
            <div className="h-9 w-full bg-surface-800 rounded" />
            <div className="h-5 w-32 bg-surface-800 rounded" />
            <div className="h-20 w-full bg-surface-800 rounded" />
          </div>
        </div>
    );
  }

  if (!project) {
    return (
        <div className="card-base p-12 flex flex-col items-center justify-center">
          <AlertTriangle size={36} className="text-error mb-3" />
          <p className="text-sm text-surface-300">{t("notFound")}</p>
        </div>
    );
  }

  return (
      <div className="space-y-6">
        <PageHeader
          title={t("title")}
          description={t("subtitle", { name: project.name })}
        />

        <div className="card-base p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              {t("nameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base max-w-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              {t("descriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-base max-w-md min-h-[80px] resize-y"
              placeholder={t("noDescription")}
            />
          </div>

          {saveError && (
            <div className="rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error max-w-md">
              {saveError}
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            loading={saving}
            disabled={!name.trim()}
          >
            {t("saveChanges")}
          </Button>
        </div>

        {/* Danger zone */}
        <div className="card-base p-6 border border-error/20">
          <h2 className="text-sm font-semibold text-error flex items-center gap-2 mb-2">
            <AlertTriangle size={16} />
            {t("dangerZone")}
          </h2>
          <p className="text-sm text-surface-400 mb-4">
            {t("dangerZoneBody")}
          </p>
          <Button
            variant="danger"
            size="sm"
            icon={<Archive size={14} />}
            onClick={() => setShowArchiveConfirm(true)}
          >
            {t("archiveProject")}
          </Button>
        </div>

        <ConfirmDialog
          open={showArchiveConfirm}
          title={t("archiveProject")}
          message={t("archiveConfirm", { name: project.name })}
          confirmLabel={t("archive")}
          variant="danger"
          loading={archiving}
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      </div>
  );
}
