"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { RotateCcw, Info } from "lucide-react";
import type { GraphNodeData, GraphEdgeData } from "@/components/force-graph";
import { PageGuide, GuideGraph } from "@/components/guides";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

// d3 is heavy and browser-only — load the graph explorer lazily, client-side.
const ForceGraph = dynamic(
  () => import("@/components/force-graph").then((m) => m.ForceGraph),
  {
    ssr: false,
    loading: () => (
      <div className="card-base h-[600px] p-4">
        <div className="h-full rounded bg-surface-800 animate-pulse" />
      </div>
    ),
  },
);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NodesApiResponse {
  data: { items: GraphNodeData[]; has_more: boolean };
}

interface EdgesApiResponse {
  data: { items: GraphEdgeData[] };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function GraphExplorerPage() {
  const { project } = useProject();
  const projectId = project?.id;

  const [graphData, setGraphData] = useState<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError(null);
    try {
      const nodesData = await get<NodesApiResponse>(`/v1/projects/${projectId}/graph/nodes?limit=100`);
      const nodes: GraphNodeData[] = nodesData.data?.items ?? [];
      const hasMore = nodesData.data?.has_more ?? false;
      if (nodes.length === 0) { setGraphData({ nodes: [], edges: [] }); setHasMore(false); setLoading(false); return; }

      // Browsers/proxies cap URL length (~2k–8k chars): chunk subject_ids
      // into ≤30-ID calls so a 100-node graph never builds one giant query
      // string. Parallel — each chunk is an independent read.
      const idChunks: string[][] = [];
      for (let i = 0; i < nodes.length; i += 30) {
        idChunks.push(nodes.slice(i, i + 30).map((n) => n.id));
      }
      const edgePages = await Promise.all(
        idChunks.map((chunk) =>
          get<EdgesApiResponse>(
            `/v1/projects/${projectId}/graph/edges?subject_ids=${chunk.join(",")}&limit=50`,
          )
        ),
      );
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      // Self-loops are NOT filtered here — the renderer draws them as arcs
      // (SELF_LOOP_RADIUS); dropping them would leave dead renderer code.
      const allEdges: GraphEdgeData[] = edgePages
        .flatMap((p) => p.data?.items ?? [])
        .filter(
          (e) => nodeIdSet.has(e.source_id) && nodeIdSet.has(e.target_id),
        );
      setGraphData({ nodes, edges: allEdges });
      setHasMore(hasMore);
    } catch (err) {
      // Surface the backend's RFC 7807 detail (e.g. a missing permission).
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load graph",
      );
    } finally { setLoading(false); }
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
          error={error}
          onRetry={loadData}
          apiConfig={{ projectId }}
          showFilter showControls showLegend
        />
      </div>
  );
}
