// ═══════════════════════════════════════════════════════════════════════════════
// OpenZync — Shared Utilities
// ═══════════════════════════════════════════════════════════════════════════════

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ─── Date / Time formatting ──────────────────────────────────────────────────

/** Relative time string ("3m ago", "2h ago", "just now") */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Formatted date string ("Apr 15, 2025") */
export function formatDate(
  dateStr: string | null | undefined,
  withTime = false,
): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (withTime) {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", opts);
}

/** Smart timestamp: "just now" for recent, "Mon 14:32" for today, etc. */
export function smartTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const timeStr = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr_fmt = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (d.toDateString() === now.toDateString()) return timeStr;
  if (d.getFullYear() === now.getFullYear())
    return `${dateStr_fmt} ${timeStr}`;
  return `${dateStr_fmt} ${d.getFullYear()} ${timeStr}`;
}

// ─── Text / ID helpers ───────────────────────────────────────────────────────

/** Truncate a UUID or long ID to first N characters */
export function truncateId(id: string | null | undefined, chars = 8): string {
  if (!id) return "—";
  return id.length > chars ? id.slice(0, chars) : id;
}

/** Copy text to clipboard and return success status */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a human-readable label from an action string.
 * e.g. "session.create" → "Session created"
 */
export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "auth.signup": "User signed up",
    "auth.login": "User logged in",
    "auth.refresh": "Session refreshed",
    "auth.profile.update": "Profile updated",
    "organization.create": "Organization created",
    "schema.create": "Extraction schema created",
    "schema.update": "Extraction schema updated",
    "schema.delete": "Extraction schema deleted",
    "api_key.create": "API key generated",
    "api_key.revoke": "API key revoked",
    "user.create": "User added",
    "user.update": "User updated",
    "user.delete": "User removed",
    "session.create": "Session created",
    "session.delete": "Session deleted",
    "memory.ingest": "Message ingested",
    "memory.wipe": "Memory wiped",
    "fact.create": "Fact extracted",
    "graph.node.delete": "Graph entity removed",
    "entity.merge": "Entities merged",
  };
  return map[action] ?? action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Number helpers ───────────────────────────────────────────────────────────

/** Format a number with locale separators (e.g. 1,234) */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

// ─── File helpers ──────────────────────────────────────────────────────────────

/**
 * Format a file size in bytes to a human-readable string.
 *
 * @param bytes - Size in bytes.
 * @param decimals - Number of decimal places (default 1).
 * @returns Formatted string like "2.4 KB" or "1.3 MB".
 */
export function formatFileSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clamped = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, clamped)).toFixed(decimals))} ${sizes[clamped]}`;
}

/**
 * Map a MIME type to a Lucide icon name for file type display.
 */
export function mimeToIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "FileImage";
  if (mimeType === "application/pdf") return "FilePdf";
  if (mimeType.startsWith("text/")) return "FileText";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "FileSpreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "FilePresentation";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip")) return "FileArchive";
  return "File";
}
