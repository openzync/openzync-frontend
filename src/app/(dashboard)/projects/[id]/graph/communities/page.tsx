"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Shield, Users as UsersIcon } from "lucide-react";
import { get, ApiError, extractList } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideGraph } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";

interface Community {
  id: string; name: string; summary: string; member_count: number; created_at: string;
}

export default function CommunitiesPage() {
  const t = useTranslations("graph.communities");
  const { project } = useProject();
  const projectId = project?.id;

  const [data, setData] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    async function fetchCommunities() {
      setLoading(true); setError(null);
      try {
        const json = await get<{ data: Community[] }>(`/v1/projects/${projectId}/graph/communities`);
        setData(json.data ?? []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
      } finally { setLoading(false); }
    }
    fetchCommunities();
  }, [projectId, t]);

  if (!projectId) {
    return (
        <div className="space-y-6">
          <PageHeader title={t("title")} description={t("noProjectDescription")} />
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={project ? t("subtitle", { name: project.name }) : t("subtitleGeneric")} />

      <PageGuide title={t("guideTitle")} illustration={<GuideGraph />}>
        <p>{t("guideBody")}</p>
      </PageGuide>

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="card-base p-6 h-32 animate-pulse" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Shield} title={t("emptyTitle")}
          description={t("emptyDescription")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((community) => (
            <div key={community.id} className="card-interactive p-5">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-sm">{community.name}</h3>
                <span className="inline-flex items-center gap-1 text-xs text-surface-400">
                  <UsersIcon size={12} />{community.member_count}
                </span>
              </div>
              <p className="text-sm text-surface-400 line-clamp-3">{community.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
