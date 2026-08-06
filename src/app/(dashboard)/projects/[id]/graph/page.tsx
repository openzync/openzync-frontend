"use client";

import { useEffect, useState, useCallback } from "react";
import { RotateCcw, Info } from "lucide-react";
import { ForceGraph, type GraphNodeData, type GraphEdgeData } from "@/components/force-graph";
import { PageGuide, GuideGraph } from "@/components/guides";
import { get, API_BASE, getAccessToken } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NodesApiResponse {
  data: { items: GraphNodeData[]; has_more: boolean };
}

interface EdgesApiResponse {
  data: { items: GraphEdgeData[] };
}

// ─── Auth headers for ForceGraph external API calls ────────────────────────────

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function GraphExplorerPage() {
  const { project } = useProject();
  const projectId = project?.id;

  const [graphData, setGraphData] = useState<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setHasError(false);
    try {
      const nodesData = await get<NodesApiResponse>(`/v1/projects/${projectId}/graph/nodes?limit=100`);
      const nodes: GraphNodeData[] = nodesData.data?.items ?? [];
      const hasMore = nodesData.data?.has_more ?? false;
      if (nodes.length === 0) { setGraphData({ nodes: [], edges: [] }); setHasMore(false); setLoading(false); return; }

      const nodeIdList = nodes.map((n) => n.id).join(",");
      const edgesData = await get<EdgesApiResponse>(
        `/v1/projects/${projectId}/graph/edges?subject_ids=${nodeIdList}&limit=50`,
      );
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      const allEdges: GraphEdgeData[] = (edgesData.data?.items ?? []).filter(
        (e) =>
          e.source_id !== e.target_id &&
          nodeIdSet.has(e.source_id) &&
          nodeIdSet.has(e.target_id),
      );
      setGraphData({ nodes, edges: allEdges });
      setHasMore(hasMore);
    } catch { setHasError(true); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { if (projectId) loadData(); }, [projectId, loadData]);

  if (!projectId) {
    return (
        <div className="space-y-6">
          <PageHeader title="Graph Explorer" description="Select a project to explore the knowledge graph" />
        </div>
    );
  }

  return (
      <div className="space-y-6">
        <PageHeader
          title="Graph Explorer"
          description={`Explore entities and relationships in your knowledge graph${project ? ` · ${project.name}` : ""}`}
          actions={
            <Button variant="secondary" size="sm" onClick={loadData} loading={loading} icon={<RotateCcw size={14} />}>
              Refresh
            </Button>
          }
        />

        <PageGuide title="Graph explorer" illustration={<GuideGraph />}>
          <p>Explore the knowledge graph visually. Nodes represent entities — people, places, concepts — and edges represent relationships between them. Search, filter, and navigate to understand your data&rsquo;s structure.</p>
        </PageGuide>

        {hasMore && (
          <div className="flex items-center gap-2 rounded-md border border-surface-800 bg-surface-900 px-3 py-2 text-xs text-surface-300">
            <Info size={14} className="shrink-0" />
            <span>Showing the first 100 entities — refine filters or query for more.</span>
          </div>
        )}

        <ForceGraph
          nodes={graphData?.nodes ?? []}
          edges={graphData?.edges ?? []}
          loading={loading}
          error={hasError ? "Failed to load graph" : null}
          onRetry={loadData}
          apiConfig={{ baseUrl: API_BASE, projectId, headers: authHeaders() }}
          showFilter showControls showLegend
        />
      </div>
  );
}
