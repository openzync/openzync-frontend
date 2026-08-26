"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { GraphNodeData, GraphEdgeData } from "@/components/force-graph";
import { PageGuide, GuideGraph } from "@/components/guides";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";
import SessionTabs from "../tabs";

// d3 is heavy and browser-only — load the graph lazily, client-side.
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

interface NodesResponse {
  data: { items: GraphNodeData[] };
}

interface EdgesResponse {
  data: { items: GraphEdgeData[] };
}

export default function SessionGraphPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project } = useProject();
  const projectId = project?.id;
  const loadAttempted = useRef(false);

  const [graphData, setGraphData] = useState<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId || !sessionId) return;
    setLoading(true);
    setError(null);
    loadAttempted.current = true;

    try {
      // Step 1: fetch session-scoped nodes
      const nodeData = await get<NodesResponse>(
        `/v1/projects/${projectId}/graph/nodes?limit=200&session_id=${sessionId}`,
      );

      const items: GraphNodeData[] = nodeData.data?.items ?? [];

      if (items.length === 0) {
        setGraphData({ nodes: [], edges: [] });
        setLoading(false);
        return;
      }

      // Step 2: fetch edges for ALL nodes in one batch call
      const nodeIdList = items.map((n) => n.id).join(",");
      const edgesData = await get<EdgesResponse>(
        `/v1/projects/${projectId}/graph/edges?subject_ids=${nodeIdList}&limit=50`,
      );
      const nodeIdSet = new Set(items.map((n) => n.id));
      const allEdges: GraphEdgeData[] = (edgesData.data?.items ?? []).filter(
        (e) =>
          e.source_id !== e.target_id &&
          nodeIdSet.has(e.source_id) &&
          nodeIdSet.has(e.target_id),
      );

      setGraphData({ nodes: items, edges: allEdges });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!projectId) {
    return (
      <div>
        <SessionTabs sessionId={sessionId} activeTab="graph" />
        <div className="card-base p-8 flex flex-col items-center justify-center gap-3 text-surface-500 mt-4">
          <p className="text-sm">No project selected.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SessionTabs sessionId={sessionId} activeTab="graph" />
      <PageGuide title="Session graph" illustration={<GuideGraph />}>
        <p>Visualize the knowledge graph extracted from this specific session. Nodes represent entities mentioned in the conversation, and edges show how they relate to each other.</p>
      </PageGuide>
      <ForceGraph
        nodes={graphData?.nodes ?? []}
        edges={graphData?.edges ?? []}
        loading={loading}
        error={error}
        onRetry={loadData}
        apiConfig={{ projectId }}
        showFilter
        showControls
        showLegend
        emptyMessage="No entities found for this session. Facts must be extracted first."
      />
    </div>
  );
}
