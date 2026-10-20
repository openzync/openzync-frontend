"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldOff, UsersIcon } from "lucide-react";
import { get, patch, apiErrorMessage } from "@/lib/api-client";
import { toast } from "sonner";
import { useApiQuery } from "@/hooks/use-api-query";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { SortableHead } from "@/components/shared/sortable-head";
import { useSortQuery } from "@/hooks/use-sort-query";
import { Button } from "@/components/ui/button";

interface OrgMember {
  id: string;
  name: string | null;
  /** Falls back to the user's external_id server-side — never null. */
  email: string;
  role: "admin" | "member" | "superadmin";
  is_active: boolean;
}

interface MembersResponse {
  data: OrgMember[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Cross-org member administration — the list comes from the superadmin
 * endpoint (GET /admin/system/orgs/{org_id}/members), which is scoped to the
 * org in the URL. GET /v1/users is scoped to the REQUESTER's own org, so it
 * can never be used here.
 */
export default function OrgMembersAdminPage() {
  // Sort state lives in the URL via useSortQuery — needs a Suspense
  // boundary during prerender.
  return (
    <Suspense fallback={null}>
      <OrgMembersAdminInner />
    </Suspense>
  );
}

// Backend whitelist for GET /admin/system/orgs/{org_id}/members — restricted
// to the fields SystemMemberListItem actually returns. It has no
// `created_at`, and the table shows no "Created" column, so sorting by it
// would order the list by a value the user cannot see.
const ORG_MEMBER_SORT_FIELDS = ["name", "email"] as const;

function OrgMembersAdminInner() {
  const { id: orgId } = useParams<{ id: string }>();
  // Server-side sort, URL-synced. Single-page list — the refreshKey
  // refetches in the new order.
  const { sortBy, sortDir, onSort, withSort } = useSortQuery({
    defaultSort: { sortBy: "name", sortDir: "asc" },
    allowedFields: ORG_MEMBER_SORT_FIELDS,
  });
  const membersQuery = useApiQuery<MembersResponse>(() =>
    get<MembersResponse>(
      `/admin/system/orgs/${orgId}/members?${withSort(new URLSearchParams({ limit: "200" }))}`,
    ),
    { refreshKey: `${sortBy}:${sortDir}` },
  );
  const members = membersQuery.data?.data ?? [];
  const loading = membersQuery.isLoading;
  const error = membersQuery.error;
  const [roleTarget, setRoleTarget] = useState<{ user: OrgMember; to: "admin" | "member" } | null>(null);
  const [changingRole, setChangingRole] = useState(false);

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    const { user, to } = roleTarget;
    setChangingRole(true);
    try {
      await patch(`/admin/system/orgs/${orgId}/members/${user.id}/role`, { role: to });
      setRoleTarget(null);
      toast.success(`"${user.name ?? user.email}" is now ${to === "admin" ? "an admin" : "a member"}`);
      membersQuery.refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update role"));
    } finally {
      setChangingRole(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href="/superadmin/orgs"
            className="rounded-md p-1.5 text-surface-400 hover:text-white hover:bg-surface-800"
            aria-label="Back to organizations"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h2 className="font-display text-lg font-medium">Organization Members</h2>
            <p className="text-sm text-surface-400 mt-0.5">
              Manage roles for organization <span className="font-mono text-xs">{orgId}</span>
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={membersQuery.refetch} />}

      <div className="card-base overflow-hidden">
        <Table zebra={false} storageKey="org-members">
          <TableHeader>
            <SortableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Name</SortableHead>
            <SortableHead field="email" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Email</SortableHead>
            <TableHead>Role</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={5} cols={4} colWidths={["w-32", "w-36", "w-20", "w-32"]} />
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={UsersIcon}
                    title="No members found"
                    description="This organization has no members yet."
                  />
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="text-surface-200">
                    {member.name || <span className="text-surface-500 italic">—</span>}
                  </TableCell>
                  <TableCell className="text-surface-200">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "admin" || member.role === "superadmin" ? "brand" : "default"} size="sm">
                      {member.role === "superadmin" ? "Superadmin" : member.role === "admin" ? "Admin" : "Member"}
                    </Badge>
                  </TableCell>
                  <TableCell align="right">
                    {/* Superadmin console uses /admin/system/... — role changes for superadmins are intentionally allowed here */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRoleTarget({
                          user: member,
                          to: member.role === "member" ? "admin" : "member",
                        })
                      }
                      className="rounded-md text-surface-400 hover:text-white"
                      title={
                        member.role === "superadmin"
                          ? "Remove superadmin"
                          : member.role === "admin"
                            ? "Remove admin"
                            : "Make admin"
                      }
                      aria-label={
                        member.role === "member"
                          ? `Make ${member.name ?? member.email} an admin`
                          : `Remove admin from ${member.name ?? member.email}`
                      }
                    >
                      {member.role === "member" ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!roleTarget}
        title={roleTarget?.to === "admin" ? "Make Admin" : "Remove Admin"}
        message={
          roleTarget?.to === "admin"
            ? `Grant admin access to "${roleTarget?.user.name ?? roleTarget?.user.email}"? Admins can manage org users, settings, and view monitoring/audit data.`
            : `Remove admin access from "${roleTarget?.user.name ?? roleTarget?.user.email}"? They will become a regular member.`
        }
        confirmLabel={roleTarget?.to === "admin" ? "Make Admin" : "Remove Admin"}
        variant={roleTarget?.to === "admin" ? "primary" : "danger"}
        loading={changingRole}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleTarget(null)}
      />
    </div>
  );
}
