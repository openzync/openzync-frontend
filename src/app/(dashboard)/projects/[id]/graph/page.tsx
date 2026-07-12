"use client";

import { useEffect, useState, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import { ForceGraph, type GraphNodeData, type GraphEdgeData } from "@/components/force-graph";
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

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setHasError(false);
    try {
      const nodesData = await get<NodesApiResponse>(`/v1/projects/${projectId}/graph/nodes?limit=100`);
      const nodes: GraphNodeData[] = nodesData.data?.items ?? [];
      if (nodes.length === 0) { setGraphData({ nodes: [], edges: [] }); setLoading(false); return; }

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
