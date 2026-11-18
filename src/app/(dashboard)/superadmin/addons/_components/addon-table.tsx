"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Package } from "lucide-react";
import { addonHealth, type AddonResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shared/table";
import { TableSkeleton } from "@/components/shared/skeleton";

// ─── Health dot (read-only snapshot per row) ──────────────────────────────────

function HealthDot({ addonId }: { addonId: string }) {
  const [status, setStatus] = useState<"ok" | "bad" | "unknown">("unknown");

  useEffect(() => {
    let cancelled = false;
    addonHealth(addonId).then(
      (h) => {
        if (!cancelled) setStatus(h.status === "ok" ? "ok" : "bad");
      },
      () => {
        if (!cancelled) setStatus("bad");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [addonId]);

  const label = status === "ok" ? "Healthy" : status === "bad" ? "Unhealthy" : "Unknown";
  return (
    <span
      role="status"
      title={label}
      aria-label={label}
      className={cn(
        "inline-block size-2.5 rounded-full",
        status === "ok" && "bg-signal",
        status === "bad" && "bg-error",
        status === "unknown" && "bg-surface-600",
      )}
    />
  );
}

// ─── Table (read-only — mutations live on the detail page) ───────────────────

interface AddonTableProps {
  addons: AddonResponse[];
  loading: boolean;
}

/**
 * Read-only registry: rows navigate to /superadmin/addons/[id] where
 * enable/upgrade/delete happen. Health is a dot snapshot, not a mutation.
 */
export function AddonTable({ addons, loading }: AddonTableProps) {
  const router = useRouter();

  return (
    <div className="card-base overflow-hidden">
      <Table storageKey="addons">
        <TableHeader>
          <TableHead>ID</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Latest</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Health</TableHead>
          <TableHead align="right">Actions</TableHead>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableSkeleton
              rows={5}
              cols={6}
              colWidths={["w-32", "w-16", "w-24", "w-12", "w-8", "w-20"]}
            />
          ) : addons.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={Package}
                  title="No add-ons installed"
                  description="Install one from a local path or a GitHub URL above."
                />
              </td>
            </tr>
          ) : (
            addons.map((addon) => {
              const href = `/superadmin/addons/${encodeURIComponent(addon.id)}`;
              return (
                <TableRow
                  key={addon.id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium text-surface-200">
                    <Link
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="text-signal-dim hover:underline focus-visible:outline-2 focus-visible:outline-accent-300"
                    >
                      {addon.id}
                    </Link>
                    {addon.update_available && (
                      <Badge variant="warning" size="sm" className="ml-2">
                        Update available
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-surface-200">
                    v{addon.version}
                  </TableCell>
                  <TableCell className="text-xs text-surface-400">
                    {addon.latest_seen ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={addon.enabled ? "success" : "default"} size="sm">
                      {addon.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <HealthDot addonId={addon.id} />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(href);
                      }}
                      title={`View ${addon.id}`}
                      aria-label={`View ${addon.id}`}
                      className="rounded-md text-surface-400 hover:text-white"
                    >
                      <Eye size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
