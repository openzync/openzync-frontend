import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ─── Variants ─────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "bg-surface-700 text-surface-300",
        success: "bg-signal/10 text-signal",
        warning: "bg-amber/10 text-amber",
        error: "bg-error/10 text-error",
        info: "bg-signal-dim/10 text-signal-dim",
        brand: "bg-signal/10 text-signal",
      },
      size: {
        sm: "text-[10px] px-1.5 py-0.5",
        md: "text-xs px-2 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

// ─── Status code badge ────────────────────────────────────────────────────────

const statusBadgeVariants = cva(
  "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-mono font-medium min-w-[32px]",
  {
    variants: {
      status: {
        info: "bg-surface-700 text-surface-400",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        error: "bg-error/10 text-error",
      },
    },
    defaultVariants: {
      status: "info",
    },
  },
);

/** Map HTTP status code → badge variant */
export function statusCodeVariant(
  code: number | null,
): "info" | "success" | "warning" | "error" {
  if (code === null) return "info";
  if (code < 300) return "success";
  if (code < 500) return "warning";
  return "error";
}

// ─── Actor type badge ─────────────────────────────────────────────────────────

export function actorTypeVariant(
  type: string | null,
): "default" | "brand" | "info" | "success" {
  if (!type || type === "system") return "default";
  if (type === "user") return "brand";
  if (type === "api_key") return "info";
  return "default";
}

export function actorTypeLabel(type: string | null): string {
  if (!type) return "system";
  const map: Record<string, string> = {
    user: "User",
    api_key: "API Key",
    system: "System",
  };
  return map[type] ?? type;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Live status — dot pulses (opacity 1→0.25). Static otherwise. */
  live?: boolean;
}

const dotColor: Record<string, string> = {
  default: "bg-muted",
  success: "bg-signal",
  warning: "bg-amber",
  error: "bg-error",
  info: "bg-signal",
  brand: "bg-signal",
};

export function Badge({
  className,
  variant = "default",
  size,
  live = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {/* Status is never color-alone — dot + text. Dot pulses only when live. */}
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          dotColor[variant ?? "default"],
          live && "animate-pulse-dot",
        )}
      />
      {children}
    </span>
  );
}

export function StatusBadge({
  code,
}: {
  code: number | null;
}) {
  const variant = statusCodeVariant(code);
  return (
    <span className={cn(statusBadgeVariants({ status: variant }), "gap-1.5")}>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", {
          "bg-muted": variant === "info",
          "bg-signal": variant === "success",
          "bg-amber": variant === "warning",
          "bg-error": variant === "error",
        })}
      />
      {code ?? "—"}
    </span>
  );
}

export function ActorTypeBadge({
  type,
}: {
  type: string | null;
}) {
  return (
    <Badge variant={actorTypeVariant(type)} size="sm">
      {actorTypeLabel(type)}
    </Badge>
  );
}
