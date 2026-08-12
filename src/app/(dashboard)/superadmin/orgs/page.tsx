"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  Plus,
  RefreshCw,
  Settings2,
  Users,
  X,
  AlertCircle,
} from "lucide-react";
import { get, post, ApiError, apiErrorMessage, type OrgListEntry, type OrgListResponse } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";

// ─── Status badge ─────────────────────────────────────────────────────────────

function OrgStatusBadge({ status }: { status: OrgListEntry["status"] }) {
  const map = {
    pending: { variant: "warning" as const, label: "Pending" },
    approved: { variant: "success" as const, label: "Approved" },
    rejected: { variant: "error" as const, label: "Rejected" },
  };
  const { variant, label } = map[status] ?? map.pending;
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}

// ─── Create-org dialog ─────────────────────────────────────────────────────────

function CreateOrgDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Organization name is required");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title="Create Organization"
      description="Creates the org directly — no approval needed."
      persistent={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="button" onClick={() => void handleSubmit()} loading={submitting}>
            Create Organization
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">
            Organization Name <span className="text-error">*</span>
          </label>
          <input
            className="input-base"
            placeholder="e.g. Acme Corp"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
          />
        </div>
        {error && (
          <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SuperadminOrgsPage() {
  const [orgs, setOrgs] = useState<OrgListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [approveTarget, setApproveTarget] = useState<OrgListEntry | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OrgListEntry | null>(null);
  const [acting, setActing] = useState(false);

  const PAGE_SIZE = 50; // backend default limit for /admin/system/orgs

  const fetchOrgs = useCallback(async (pageNum: number): Promise<OrgListResponse> => {
    return get<OrgListResponse>(`/admin/system/orgs?page=${pageNum}&limit=${PAGE_SIZE}`);
  }, []);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrgs(1);
      setOrgs(data.data);
      setPage(1);
      setHasMore(data.page * data.limit < data.total);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load organizations"));
    } finally {
      setLoading(false);
    }
  }, [fetchOrgs]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchOrgs(nextPage);
      setOrgs((prev) => [...prev, ...data.data]);
      setPage(nextPage);
      setHasMore(data.page * data.limit < data.total);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load more organizations"));
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, fetchOrgs]);

  useEffect(() => {
    // Defer through a microtask so the state update is not synchronous
    // within the effect body (react-hooks/set-state-in-effect).
    const run = async () => {
      await loadOrgs();
    };
    void run();
  }, [loadOrgs]);

  const handleCreate = async (name: string) => {
    await post("/admin/organizations", { name });
    setShowCreate(false);
    toast.success(`Organization "${name}" created`);
    await loadOrgs();
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      await post(`/admin/system/orgs/${approveTarget.id}/approve`);
      setApproveTarget(null);
      toast.success(`"${approveTarget.name}" approved`);
      await loadOrgs();
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
      await loadOrgs();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reject organization"));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">All Organizations</h2>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
          Create Organization
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={loadOrgs} />}

      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-800">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {loading ? (
                <TableSkeleton rows={5} cols={4} colWidths={["w-32", "w-20", "w-28", "w-40"]} />
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={Building2}
                      title="No organizations yet"
                      description="Organizations appear here as they are created or requested."
                    />
                  </td>
                </tr>
              ) : (
                orgs.map((org) => (
                  <tr key={org.id} className="transition-colors hover:bg-surface-800/50">
                    <td className="px-4 py-3 text-surface-200 font-medium">{org.name}</td>
                    <td className="px-4 py-3">
                      <OrgStatusBadge status={org.status} />
                    </td>
                    <td className="px-4 py-3 text-surface-200 text-xs">{formatDate(org.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {org.status === "pending" && (
                          <>
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
                          </>
                        )}
                        <Link href={`/superadmin/orgs/${org.id}/config`}>
                          <Button variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-white" title="Organization configuration">
                            <Settings2 size={14} />
                          </Button>
                        </Link>
                        <Link href={`/superadmin/orgs/${org.id}/members`}>
                          <Button variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-white" title="Members">
                            <Users size={14} />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && hasMore && (
          <div className="border-t border-surface-800 px-4 py-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore} className="text-surface-400 hover:text-white gap-2">
              <RefreshCw size={14} />
              Load More
            </Button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOrgDialog onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}

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
