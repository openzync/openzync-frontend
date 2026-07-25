"use client";

import { cn } from "@/lib/utils";
import {
  File,
  FileImage,
  FileText,
  FileArchive,
  FileBox,
  FileDown,
  Download,
} from "lucide-react";
import { useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────

export interface BlobCardData {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  download_url?: string | null;
}

interface BlobCardProps {
  blob: BlobCardData;
  /** If true, show a thumbnail preview for image blobs. */
  showPreview?: boolean;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatFileSize(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function mimeToIcon(mime: string): typeof File {
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "application/pdf") return FileBox;
  if (mime.startsWith("text/")) return FileText;
  if (mime.includes("sheet") || mime.includes("excel"))
    return FileText;
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return FileBox;
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip"))
    return FileArchive;
  return File;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

// ── Component ───────────────────────────────────────────────────────────

export function BlobCard({
  blob,
  showPreview = true,
  className,
}: BlobCardProps) {
  const [imgError, setImgError] = useState(false);
  const Icon = mimeToIcon(blob.mime_type);
  const showThumbnail = isImage(blob.mime_type) && showPreview && !imgError;

  const handleClick = () => {
    if (blob.download_url) {
      window.open(blob.download_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!blob.download_url}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border border-surface-700",
        "bg-surface-800/50 px-3 py-2 text-left transition-colors",
        "hover:bg-surface-700/50 hover:border-surface-600",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "max-w-[260px] min-w-0",
        className,
      )}
      title={blob.file_name}
    >
      {/* Thumbnail / Icon */}
      <div className="shrink-0 size-10 rounded-md overflow-hidden bg-surface-800 flex items-center justify-center">
        {showThumbnail && blob.download_url ? (
          <img
            src={blob.download_url}
            alt={blob.file_name}
            className="size-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <Icon className="size-5 text-surface-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-200 truncate">
          {blob.file_name}
        </p>
        <p className="text-xs text-surface-500">
          {formatFileSize(blob.file_size)}
          <span className="mx-1">·</span>
          {blob.mime_type}
        </p>
      </div>

      {/* Download indicator */}
      {blob.download_url && (
        <Download className="size-4 shrink-0 text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

/**
 * Skeleton placeholder for BlobCard while data is loading.
 */
export function BlobCardSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-2 max-w-[260px] animate-pulse">
      <div className="size-10 rounded-md bg-surface-700" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-28 rounded bg-surface-700" />
        <div className="h-3 w-20 rounded bg-surface-700" />
      </div>
    </div>
  );
}
