import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

// ─── Variants ─────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Inverted primary: solid text fill on dark, signal on hover. ONE per screen.
  primary:
    "bg-text-primary text-surface-950 hover:bg-signal hover:text-surface-950",
  // Ghost default: transparent, line border, muted text.
  secondary:
    "bg-transparent text-muted border border-line hover:border-signal-dim hover:text-text",
  ghost:
    "bg-transparent text-muted border border-line hover:border-signal-dim hover:text-text",
  danger:
    "bg-transparent text-error border border-error/40 hover:border-error hover:text-error",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1.5 rounded-md gap-1.5",
  md: "text-sm px-4 py-2 rounded-md gap-1.5",
  lg: "text-sm px-5 py-2.5 rounded-lg gap-2",
};

/**
 * Shared button component.
 * Replaces .btn-primary, .btn-secondary, .btn-ghost, .btn-danger CSS classes.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "cursor-pointer",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={14} /> : icon ? icon : null}
      {children}
    </button>
  );
}
