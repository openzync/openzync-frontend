"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldOff, UsersIcon } from "lucide-react";
import { get, patch, apiErrorMessage } from "@/lib/api-client";
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

interface OrgMember {
  id: string;
  external_id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "member";
  created_at: string;
}

interface MembersResponse {
  data: OrgMember[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Cross-org member administration — role changes go through the superadmin
 * endpoint. The member LIST reuses the org users endpoint (GET /v1/users);
 * the contract has no org-scoped member-list endpoint, so this resolves to
 * the current session's org users until the backend adds one.
 */
export default function OrgMembersAdminPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const membersQuery = useApiQuery<MembersResponse>(() =>
    get<MembersResponse>("/v1/users?limit=50"),
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
      toast.success(`"${user.name ?? user.external_id}" is now ${to === "admin" ? "an admin" : "a member"}`);
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
            <h2 className="text-lg font-semibold">Organization Members</h2>
            <p className="text-sm text-surface-400 mt-0.5">
              Manage roles for organization <span className="font-mono text-xs">{orgId}</span>
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={membersQuery.refetch} />}

      <div className="card-base overflow-hidden">
        <Table zebra={false}>
          <TableHeader>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={5} cols={5} colWidths={["w-32", "w-36", "w-20", "w-28", "w-32"]} />
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={5}>
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
                    {member.email || <span className="text-surface-500 italic">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "admin" ? "brand" : "default"} size="sm">
                      {member.role === "admin" ? "Admin" : "Member"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-surface-200 text-xs">{formatDate(member.created_at)}</TableCell>
                  <TableCell align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRoleTarget({ user: member, to: member.role === "admin" ? "member" : "admin" })
                      }
                      className="rounded-md text-surface-400 hover:text-white"
                      title={member.role === "admin" ? "Remove admin" : "Make admin"}
                      aria-label={
                        member.role === "admin"
                          ? `Remove admin from ${member.name ?? member.external_id}`
                          : `Make ${member.name ?? member.external_id} an admin`
                      }
                    >
                      {member.role === "admin" ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
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
            ? `Grant admin access to "${roleTarget?.user.name ?? roleTarget?.user.external_id}"? Admins can manage org users, settings, and view monitoring/audit data.`
            : `Remove admin access from "${roleTarget?.user.name ?? roleTarget?.user.external_id}"? They will become a regular member.`
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
