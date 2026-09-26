"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  Calendar,
  Clock,
  MessageSquare,
  Database,
  Hash,
  RefreshCw,
  Eye,
  User as UserIcon,
} from "lucide-react";
import { get, ApiError } from "@/lib/api-client";
import { smartTimestamp, truncateId } from "@/lib/utils";
import { useProject } from "@/stores/project-context";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { CopyButton } from "@/components/shared/copy-button";
import { MetadataRow } from "@/components/shared/metadata-row";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import type { GraphNodeData, GraphEdgeData } from "@/components/force-graph";

// d3 is heavy and browser-only — load the graph lazily, client-side.
const ForceGraph = dynamic(
  () => import("@/components/force-graph").then((m) => m.ForceGraph),
  {
    ssr: false,
    loading: () => (
      <div className="h-[240px] rounded bg-surface-800 animate-pulse" />
    ),
  },
);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SessionDetail {
  id: string;
  user_id: string;
  external_id: string;
  is_active: boolean;
  message_count: number;
  fact_count: number;
  pending_enrichment_count: number;
  observation_count: number;
  created_at: string;
  closed_at?: string | null;
}

interface PreviewMessage {
  id?: string;
  role: string;
  content: string;
  created_at?: string;
}

interface PreviewFact {
  id: string;
  content: string;
  confidence: number;
}

interface PreviewClassification {
  id: string;
  role: string;
  message: string;
  intent: string | null;
  emotion: string | null;
}

interface PreviewExtraction {
  id: string;
  schema_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

interface PreviewObservation {
  id: string;
  observation_type: string;
  content: string;
  confidence: number;
  created_at: string;
  session_id?: string | null;
}

interface NodesResponse {
  data: { items: GraphNodeData[] };
}

interface EdgesResponse {
  data: { items: GraphEdgeData[] };
}

// ─── Preview primitives ────────────────────────────────────────────────────────

function PreviewSection({
  title,
  label,
  href,
  children,
}: {
  title: string;
  label: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <section className="card-base min-w-0 p-5">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-surface-100">{title}</h2>
        <Link
          href={href}
          aria-label={`View all ${label}`}
          className="text-sm font-medium text-brand-400 hover:text-brand-300"
        >
          View all →
        </Link>
      </div>
      {children}
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

interface PreviewBodyProps<T> {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  items: T[];
  emptyText: string;
  children: (items: T[]) => ReactNode;
}

/** Shared loading/error/empty shell for the overview preview sections. */
function PreviewBody<T>({
  loading,
  error,
  onRetry,
  items,
  emptyText,
  children,
}: PreviewBodyProps<T>) {
  if (loading && items.length === 0) return <PreviewSkeleton />;
  if (error && items.length === 0)
    return <ErrorState message={error} onRetry={onRetry} />;
  if (items.length === 0)
    return <p className="text-sm text-surface-500">{emptyText}</p>;
  return <>{children(items)}</>;
}

function messageRoleVariant(role: string): "brand" | "success" | "default" {
  if (role === "user") return "brand";
  if (role === "assistant") return "success";
  return "default";
}

function classificationRoleVariant(
  role: string,
): "brand" | "success" | "warning" | "default" {
  if (role === "user") return "brand";
  if (role === "assistant") return "success";
  if (role === "tool") return "warning";
  return "default";
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { project, loading: projectLoading } = useProject();
  const projectId = project?.id;

  // Fetch session — useApiQuery keeps data during refetch and is race-safe.
  const sessionQuery = useApiQuery<SessionDetail>(async () => {
    try {
      return await get<SessionDetail>(
        `/v1/projects/${projectId}/sessions/${sessionId}`,
      );
    } catch (err) {
      // Preserve the page's friendly 404 copy through the hook's normalizer.
      if (err instanceof ApiError && err.isNotFound) {
        throw new Error("Session not found.");
      }
      throw err;
    }
  }, { enabled: Boolean(projectId && sessionId) });

  const session = sessionQuery.data;
  const loading = sessionQuery.isLoading;
  const error = sessionQuery.error ?? "";

  // ── Preview queries — independent, never gate each other or the page ──
  const previewEnabled = Boolean(projectId && sessionId);

  const messagesQuery = useApiQuery<{ data: PreviewMessage[] }>(
    () =>
      get<{ data: PreviewMessage[] }>(
        `/v1/projects/${projectId}/sessions/${sessionId}/messages?limit=5`,
      ),
    { enabled: previewEnabled },
  );
  const messages = (messagesQuery.data?.data ?? []).slice(-5);

  const factsQuery = useApiQuery<{ data: PreviewFact[] }>(
    () =>
      get<{ data: PreviewFact[] }>(
        `/v1/projects/${projectId}/sessions/${sessionId}/facts?limit=5`,
      ),
    { enabled: previewEnabled },
  );
  const facts = factsQuery.data?.data ?? [];

  const classificationsQuery = useApiQuery<{ data: PreviewClassification[] }>(
    () =>
      get<{ data: PreviewClassification[] }>(
        `/v1/projects/${projectId}/sessions/${sessionId}/classifications`,
      ),
    { enabled: previewEnabled },
  );
  const classifications = (classificationsQuery.data?.data ?? []).slice(0, 3);

  const extractionsQuery = useApiQuery<{ items: PreviewExtraction[] }>(
    () =>
      get<{ items: PreviewExtraction[] }>(
        `/v1/projects/${projectId}/sessions/${sessionId}/structured-extractions`,
      ),
    { enabled: previewEnabled },
  );
  const extractions = (extractionsQuery.data?.items ?? []).slice(0, 3);

  const observationsQuery = useApiQuery<{ data: PreviewObservation[] }>(
    () => get<{ data: PreviewObservation[] }>(`/v1/projects/${projectId}/observations`),
    { enabled: previewEnabled },
  );
  const allObservations = observationsQuery.data?.data ?? [];
  const scopedObservations = allObservations.filter(
    (o) => o.session_id === sessionId,
  );
  const observationsScoped = scopedObservations.length > 0;
  const observations = (observationsScoped
    ? scopedObservations
    : allObservations
  ).slice(0, 3);

  const graphQuery = useApiQuery<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] }>(
    async () => {
      const nodeData = await get<NodesResponse>(
        `/v1/projects/${projectId}/graph/nodes?limit=200&session_id=${sessionId}`,
      );
      const capped = (nodeData.data?.items ?? []).slice(0, 15);
      if (capped.length === 0) return { nodes: [], edges: [] };
      const nodeIdList = capped.map((n) => n.id).join(",");
      const edgesData = await get<EdgesResponse>(
        `/v1/projects/${projectId}/graph/edges?subject_ids=${nodeIdList}&limit=50`,
      );
      const nodeIdSet = new Set(capped.map((n) => n.id));
      const edges = (edgesData.data?.items ?? []).filter(
        (e) =>
          e.source_id !== e.target_id &&
          nodeIdSet.has(e.source_id) &&
          nodeIdSet.has(e.target_id),
      );
      return { nodes: capped, edges };
    },
    { enabled: previewEnabled },
  );
  const graphNodes = graphQuery.data?.nodes ?? [];
  const graphEdges = graphQuery.data?.edges ?? [];

  const baseHref = projectId
    ? `/projects/${projectId}/sessions/${sessionId}`
    : "#";

  // Loading guard
  if (projectLoading) {
    return (
        <div className="space-y-6">
          <div className="h-6 w-48 rounded bg-surface-800 animate-pulse" />
        </div>
    );
  }

  // Render — header + tabs come from the [sessionId] layout.
  return (
    <div className="space-y-6">
      {/* Session-info gist */}
      <div className="card-base p-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded bg-surface-800 animate-pulse" />
                <div className="h-4 w-32 rounded bg-surface-800 animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={sessionQuery.refetch} />
        ) : session ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MetadataRow icon={<Hash size={16} />} label="Session ID">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-surface-800 rounded px-2 py-0.5">
                  {truncateId(session.id)}
                </span>
                <CopyButton value={session.id} />
              </div>
            </MetadataRow>

            <MetadataRow icon={<UserIcon size={16} />} label="Created By">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-surface-800 rounded px-2 py-0.5">
                  {truncateId(session.user_id)}
                </span>
                <CopyButton value={session.user_id} />
              </div>
            </MetadataRow>

            <MetadataRow icon={<Calendar size={16} />} label="Created">
              <span>{smartTimestamp(session.created_at)}</span>
            </MetadataRow>

            <MetadataRow icon={<Clock size={16} />} label="Closed">
              {session.closed_at ? (
                <span>{smartTimestamp(session.closed_at)}</span>
              ) : (
                <span className="text-surface-500">—</span>
              )}
            </MetadataRow>

            <MetadataRow icon={<MessageSquare size={16} />} label="Messages">
              <span className="font-semibold">
                {session.message_count.toLocaleString()}
              </span>
            </MetadataRow>

            <MetadataRow icon={<Database size={16} />} label="Facts">
              <span className="font-semibold">
                {session.fact_count.toLocaleString()}
              </span>
            </MetadataRow>

            <MetadataRow icon={<RefreshCw size={16} />} label="Pending Enrichment">
              <span className="font-semibold">
                {session.pending_enrichment_count.toLocaleString()}
              </span>
            </MetadataRow>

            <MetadataRow icon={<Eye size={16} />} label="Observations">
              <span className="font-semibold">
                {(session.observation_count ?? 0).toLocaleString()}
              </span>
            </MetadataRow>
          </div>
        ) : null}
      </div>

      {/* Messages preview */}
      <PreviewSection title="Messages" label="Messages" href={`${baseHref}/messages`}>
        <PreviewBody
          loading={!projectId || messagesQuery.isLoading}
          error={messagesQuery.error}
          onRetry={messagesQuery.refetch}
          items={messages}
          emptyText="No messages yet."
        >
          {(items) => (
            <div>
              {items.map((m, index) => (
                <div
                  key={m.id ?? index}
                  className="flex items-start gap-2 border-b border-surface-800 py-2 last:border-0"
                >
                  <Badge variant={messageRoleVariant(m.role)} size="sm">
                    {m.role}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-surface-200">{m.content}</p>
                    {m.created_at && (
                      <p className="text-xs text-surface-500">
                        {smartTimestamp(m.created_at)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PreviewBody>
      </PreviewSection>

      {/* Facts + Graph pair */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Facts preview */}
      <PreviewSection title="Facts" label="Facts" href={`${baseHref}/facts`}>
        <PreviewBody
          loading={!projectId || factsQuery.isLoading}
          error={factsQuery.error}
          onRetry={factsQuery.refetch}
          items={facts}
          emptyText="No facts extracted yet."
        >
          {(items) => (
            <div>
              {items.map((f) => (
                <div
                  key={f.id}
                  className="border-b border-surface-800 py-2 last:border-0"
                >
                  <p className="truncate text-sm text-surface-200">{f.content}</p>
                  <p className="text-xs text-surface-500">
                    {(f.confidence * 100).toFixed(0)}% confidence
                  </p>
                </div>
              ))}
            </div>
          )}
        </PreviewBody>
      </PreviewSection>

      {/* Graph preview */}
      <PreviewSection title="Graph" label="Graph" href={`${baseHref}/graph`}>
        {!projectId || (graphQuery.isLoading && graphNodes.length === 0) ? (
          <Skeleton className="h-[240px] w-full" />
        ) : graphQuery.error && graphNodes.length === 0 ? (
          <ErrorState message={graphQuery.error} onRetry={graphQuery.refetch} />
        ) : (
          <div className="h-[240px] overflow-hidden pointer-events-none">
            <ForceGraph
              nodes={graphNodes}
              edges={graphEdges}
              loading={graphQuery.isLoading}
              error={graphQuery.error}
              onRetry={graphQuery.refetch}
              apiConfig={{ projectId }}
              height={240}
              showFilter={false}
              showControls={false}
              showLegend={false}
              emptyMessage="No graph entities yet"
            />
          </div>
        )}
      </PreviewSection>
      </div>

      {/* Observations + Classifications pair */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Observations preview */}
      <PreviewSection
        title="Observations"
        label="Observations"
        href={`${baseHref}/observations`}
      >
        <PreviewBody
          loading={!projectId || observationsQuery.isLoading}
          error={observationsQuery.error}
          onRetry={observationsQuery.refetch}
          items={observations}
          emptyText="No observations yet."
        >
          {(items) => (
            <div>
              {items.map((o) => (
                <div
                  key={o.id}
                  className="border-b border-surface-800 py-2 last:border-0"
                >
                  <p className="truncate text-sm text-surface-200">{o.content}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                    <Badge variant="brand" size="sm">
                      {o.observation_type}
                    </Badge>
                    <span>{(o.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
              {!observationsScoped && (
                <p className="mt-2 text-xs text-surface-500">(project-wide)</p>
              )}
            </div>
          )}
        </PreviewBody>
      </PreviewSection>

      {/* Classifications preview */}
      <PreviewSection
        title="Classifications"
        label="Classifications"
        href={`${baseHref}/classifications`}
      >
        <PreviewBody
          loading={!projectId || classificationsQuery.isLoading}
          error={classificationsQuery.error}
          onRetry={classificationsQuery.refetch}
          items={classifications}
          emptyText="No classifications yet."
        >
          {(items) => (
            <div>
              {items.map((c) => (
                <div
                  key={c.id}
                  className="border-b border-surface-800 py-2 last:border-0"
                >
                  <p className="truncate text-sm text-surface-200">{c.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-surface-500">
                    <Badge variant={classificationRoleVariant(c.role)} size="sm">
                      {c.role}
                    </Badge>
                    <span>Intent: {c.intent ?? "—"}</span>
                    <span>Emotion: {c.emotion ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PreviewBody>
      </PreviewSection>
      </div>

      {/* Extractions preview */}
      <PreviewSection
        title="Extractions"
        label="Extractions"
        href={`${baseHref}/extractions`}
      >
        <PreviewBody
          loading={!projectId || extractionsQuery.isLoading}
          error={extractionsQuery.error}
          onRetry={extractionsQuery.refetch}
          items={extractions}
          emptyText="No structured extractions yet."
        >
          {(items) => (
            <div>
              {items.map((ext) => (
                <div
                  key={ext.id}
                  className="border-b border-surface-800 py-2 last:border-0"
                >
                  <p className="text-sm text-surface-200">
                    Schema:{" "}
                    <span className="font-mono text-xs">
                      {ext.schema_id ?? "none"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-surface-500">
                    {JSON.stringify(ext.data)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PreviewBody>
      </PreviewSection>

    </div>
  );
}
