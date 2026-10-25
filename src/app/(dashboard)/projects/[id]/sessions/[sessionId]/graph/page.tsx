"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { GraphNodeData, GraphEdgeData } from "@/components/force-graph";
import { get, ApiError } from "@/lib/api-client";
import { useProject } from "@/stores/project-context";

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

      // Browsers/proxies cap URL length (~2k–8k chars): chunk subject_ids
      // into ≤30-ID calls so a 200-node session graph never builds one giant
      // query string. Parallel — each chunk is an independent read.
      const idChunks: string[][] = [];
      for (let i = 0; i < items.length; i += 30) {
        idChunks.push(items.slice(i, i + 30).map((n) => n.id));
      }
      const edgePages = await Promise.all(
        idChunks.map((chunk) =>
          get<EdgesResponse>(
            `/v1/projects/${projectId}/graph/edges?subject_ids=${chunk.join(",")}&limit=50`,
          ),
        ),
      );
      const nodeIdSet = new Set(items.map((n) => n.id));
      const allEdges: GraphEdgeData[] = edgePages
        .flatMap((p) => p.data?.items ?? [])
        .filter(
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
        <div className="card-base p-8 flex flex-col items-center justify-center gap-3 text-surface-500 mt-4">
          <p className="text-sm">No project selected.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
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
