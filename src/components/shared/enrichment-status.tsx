import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EnrichmentStatusProps {
  /** Async enrichment job UUID returned by POST /memory (may be null). */
  jobId?: string;
  /** Ingest ack status from the API — documented as fixed value "accepted". */
  status?: string | null;
  /** Number of episodes (messages) ingested. */
  episodeCount?: number;
  /** Number of blob files attached to the ingest. */
  blobCount?: number;
}

type StageState = "done" | "active" | "pending";

interface Stage {
  key: string;
  label: string;
  state: StageState;
}

// `status` on IngestMemoryResponse is a synchronous-ack enum ("accepted"), not a
// pipeline-progress enum. Known values map onto the stage model; anything else
// is treated as free-text and shown verbatim with a processing pulse.
const KNOWN_STATUSES = new Set([
  "accepted",
  "ok",
  "queued",
  "pending",
  "processing",
]);
const DONE_STATUSES = new Set(["done", "completed", "complete", "finished"]);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StageNode({ state }: { state: StageState }) {
  if (state === "done") {
    return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />;
  }
  if (state === "active") {
    return (
      <span
        className="size-2 shrink-0 rounded-full bg-brand-300 animate-pulse-dot"
        aria-hidden="true"
      />
    );
  }
  return <Circle className="size-4 shrink-0 text-surface-600" aria-hidden="true" />;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function EnrichmentStatus({
  jobId,
  status,
  episodeCount,
  blobCount,
}: EnrichmentStatusProps) {
  const statusText = status?.trim().toLowerCase();
  const isKnown = statusText ? KNOWN_STATUSES.has(statusText) || DONE_STATUSES.has(statusText) : false;
  const isDone = statusText ? DONE_STATUSES.has(statusText) : false;

  const note =
    "Enrichment runs in the background — entities and facts appear as workers process episodes.";

  // Free-text status (not a known enum value): show verbatim with a pulse.
  if (status && !isKnown) {
    return (
      <div role="status" aria-label="Enrichment pipeline status" className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin text-brand-300" aria-hidden="true" />
          <span className="font-medium text-surface-200">{status}</span>
        </div>
        {jobId && (
          <p className="font-mono text-xs text-surface-300 truncate" title={jobId}>
            Job {jobId}
          </p>
        )}
        <p className="text-xs text-surface-300 leading-relaxed">{note}</p>
      </div>
    );
  }

  const stages: Stage[] = [
    { key: "accepted", label: "Ingest accepted", state: "done" },
    { key: "queued", label: "Job queued", state: jobId ? "done" : "pending" },
    { key: "processing", label: "Processing", state: isDone ? "done" : "active" },
    { key: "done", label: "Done", state: isDone ? "done" : "pending" },
  ];

  return (
    <div role="status" aria-label="Enrichment pipeline status" className="flex flex-col gap-2.5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {stages.map((stage, i) => (
          <li key={stage.key} className="flex items-center gap-x-2">
            {i > 0 && <span className="h-px w-4 bg-surface-700" aria-hidden="true" />}
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                stage.state === "done" && "text-surface-200",
                stage.state === "active" && "text-brand-300",
                stage.state === "pending" && "text-surface-500",
              )}
            >
              <StageNode state={stage.state} />
              {stage.label}
            </span>
          </li>
        ))}
      </ol>
      {(episodeCount !== undefined && episodeCount > 0 || jobId) && (
        <p className="text-xs text-surface-300 truncate">
          {episodeCount !== undefined && episodeCount > 0 && (
            <span className="font-medium text-surface-300">
              {episodeCount} episode{episodeCount === 1 ? "" : "s"} queued for enrichment
            </span>
          )}
          {episodeCount !== undefined && episodeCount > 0 && jobId && <span className="mx-1.5 text-surface-600">·</span>}
          {jobId && (
            <span className="font-mono" title={jobId}>
              Job {jobId}
            </span>
          )}
        </p>
      )}
      {blobCount !== undefined && blobCount > 0 && (
        <p className="text-xs font-medium text-surface-300">
          {blobCount} file{blobCount === 1 ? "" : "s"} attached
        </p>
      )}
      <p className="text-xs text-surface-300 leading-relaxed">{note}</p>
    </div>
  );
}
