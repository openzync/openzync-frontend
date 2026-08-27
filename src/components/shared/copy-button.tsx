"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** Text to place on the clipboard. */
  value: string;
  /** Accessible name + tooltip. Defaults to "Copy to clipboard". */
  label?: string;
  className?: string;
  /** Called after a successful clipboard write (e.g. caller-owned toast). */
  onSuccess?: () => void;
  /**
   * Called when the clipboard write fails. The component never swallows the
   * error: it logs via console.error and hands notification policy to the
   * caller.
   */
  onError?: () => void;
}

/**
 * Small icon button that copies `value` to the clipboard and flashes a check
 * icon for ~2s on success. Renders no toasts itself — callers own
 * notification policy via onSuccess/onError.
 */
export function CopyButton({
  value,
  label = "Copy to clipboard",
  className,
  onSuccess,
  onError,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onSuccess?.();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("CopyButton: clipboard write failed", err);
      onError?.();
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "text-surface-500 hover:text-surface-300 transition-colors shrink-0",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}
