"use client";

import { useState } from "react";
import { Inbox, AlertTriangle, Check, X } from "lucide-react";
import {
  get,
  post,
  ApiError,
  extractList,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { ProjectsSectionShell } from "../projects/components/projects-section-shell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectApproval {
  project_id: string;
  project_name?: string | null;
  role: string;
  requested_at?: string | null;
  created_at?: string | null;
}

function requestedLabel(a: ProjectApproval): string {
  const raw = a.requested_at ?? a.created_at;
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProjectInvitationsPage() {
  const approvalsQuery = useApiQuery<ProjectApproval[] | { data: ProjectApproval[] }>(
    (signal) => get<ProjectApproval[] | { data: ProjectApproval[] }>(
      "/v1/me/project-approvals",
      { signal },
    ),
  );
  const approvals = approvalsQuery.data
    ? extractList<ProjectApproval>(approvalsQuery.data)
    : null;

  const [actingId, setActingId] = useState<string | null>(null);

  async function handleDecision(approval: ProjectApproval, decision: "approve" | "reject") {
    setActingId(`${approval.project_id}:${decision}`);
    try {
      await post(`/v1/projects/${approval.project_id}/members/${decision}`);
      toast.success(
        decision === "approve"
          ? `You joined "${approval.project_name ?? "the project"}"`
          : "Invitation declined",
      );
      approvalsQuery.refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : `Failed to ${decision} invitation`,
      );
    } finally {
      setActingId(null);
    }
  }

  return (
    <ProjectsSectionShell
      title="Project invitations"
      description="Projects waiting for you to approve or decline"
      guideTitle="Project invitations"
      guideBody={
        <p>
          Invitations list workspaces waiting for you to approve or decline.
        </p>
      }>
      {approvalsQuery.isLoading ? (
        <TableSkeleton rows={3} cols={4} colWidths={["w-32", "w-36", "w-20", "w-32"]} standalone />
      ) : approvalsQuery.error ? (
        <div className="card-base p-12 flex flex-col items-center justify-center">
          <AlertTriangle size={36} className="text-error mb-3" />
          <p className="text-sm text-surface-300 mb-4">{approvalsQuery.error}</p>
          <Button variant="secondary" size="sm" onClick={approvalsQuery.refetch}>
            Retry
          </Button>
        </div>
      ) : !approvals || approvals.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending invitations"
          description="You have no pending project invitations."
        />
      ) : (
        <div className="card-base overflow-hidden">
          <Table zebra={false} storageKey="project-approvals">
            <TableHeader>
              <TableHead>Project</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead align="right">Actions</TableHead>
            </TableHeader>
            <TableBody>
              {approvals.map((approval) => {
                const key = approval.project_id;
                const busy = actingId?.startsWith(key) ?? false;
                return (
                  <TableRow key={key}>
                    <TableCell className="text-surface-200">
                      {approval.project_name ?? (
                        <span className="font-mono text-xs">{approval.project_id.slice(0, 8)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" size="sm">
                        {approval.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-surface-400">
                      {requestedLabel(approval)}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Check size={14} />}
                          disabled={busy}
                          loading={actingId === `${key}:approve`}
                          onClick={() => void handleDecision(approval, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<X size={14} />}
                          disabled={busy}
                          loading={actingId === `${key}:reject`}
                          onClick={() => void handleDecision(approval, "reject")}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </ProjectsSectionShell>
  );
}
