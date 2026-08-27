"use client";

import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { get, post, apiErrorMessage, type OrgListEntry, type OrgListResponse } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useApiQuery } from "@/hooks/use-api-query";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { Button } from "@/components/ui/button";

/**
 * Approval queue — the front-and-center view of orgs waiting for a decision.
 * Only `pending` orgs from GET /admin/system/orgs are shown; approve/reject
 * move the row out of the queue on the next refetch.
 */
export default function SuperadminRequestsPage() {
  const requestsQuery = useApiQuery<OrgListResponse>(() =>
    get<OrgListResponse>("/admin/system/orgs?limit=100"),
  );
  const pending = (requestsQuery.data?.data ?? []).filter(
    (org) => org.status === "pending",
  );
  const loading = requestsQuery.isLoading;
  const error = requestsQuery.error;
  const [approveTarget, setApproveTarget] = useState<OrgListEntry | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OrgListEntry | null>(null);
  const [acting, setActing] = useState(false);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      await post(`/admin/system/orgs/${approveTarget.id}/approve`);
      setApproveTarget(null);
      toast.success(`"${approveTarget.name}" approved`);
      requestsQuery.refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to approve organization"));
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      await post(`/admin/system/orgs/${rejectTarget.id}/reject`);
      setRejectTarget(null);
      toast.success(`"${rejectTarget.name}" rejected`);
      requestsQuery.refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reject organization"));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Approval Requests</h2>
          <p className="text-sm text-surface-400 mt-0.5">
            Organizations waiting for your decision
          </p>
        </div>
        {!loading && pending.length > 0 && (
          <Badge variant="warning" size="sm">
            {pending.length} pending
          </Badge>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={requestsQuery.refetch} />}

      <div className="card-base overflow-hidden">
        <Table zebra={false}>
          <TableHeader>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={4} cols={4} colWidths={["w-32", "w-20", "w-28", "w-32"]} />
            ) : pending.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={Inbox}
                    title="No pending requests"
                    description="You’re all caught up — new organization requests will appear here."
                  />
                </td>
              </tr>
            ) : (
              pending.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="text-surface-200 font-medium">{org.name}</TableCell>
                  <TableCell>
                    <Badge variant="warning" size="sm">Pending</Badge>
                  </TableCell>
                  <TableCell className="text-surface-200 text-xs">{formatDate(org.created_at)}</TableCell>
                  <TableCell align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setApproveTarget(org)}
                        className="rounded-md text-success hover:text-white"
                        title={`Approve ${org.name}`}
                        aria-label={`Approve ${org.name}`}
                      >
                        <Check size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRejectTarget(org)}
                        className="rounded-md text-surface-400 hover:text-error"
                        title={`Reject ${org.name}`}
                        aria-label={`Reject ${org.name}`}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!approveTarget}
        title="Approve Organization"
        message={`Approve "${approveTarget?.name}"? Its members can sign in and start using the platform.`}
        confirmLabel="Approve"
        variant="primary"
        loading={acting}
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
      />

      <ConfirmDialog
        open={!!rejectTarget}
        title="Reject Organization"
        message={`Reject "${rejectTarget?.name}"? This declines the registration request.`}
        confirmLabel="Reject"
        variant="danger"
        loading={acting}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  );
}
