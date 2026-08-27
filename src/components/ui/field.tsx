"use client";

import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FieldProps {
  /** Rendered inside the label; also used to derive hint/error ids. */
  label: string;
  /** Must equal the child control's `id` — this is what makes the pair accessible. */
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** A single control element (input/select/textarea) with id={htmlFor}. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Form field composition: label + control + hint + error with ARIA wiring
 * done for you. Solves the app-wide unassociated-label failure by construction.
 *
 * The single child control is cloned with `aria-describedby` (hint/error ids)
 * and `aria-invalid` when an error is present — unless the child already sets
 * them.
 *
 * @example
 * <Field label="Display name" htmlFor="display-name" required hint="Shown to org members">
 *   <input id="display-name" className="input-base" … />
 * </Field>
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Inject ARIA attrs into the child control; pass through anything else.
  // Only when the child itself carries id={htmlFor} (the contract above) —
  // composite wrappers (e.g. input + overlay button) manage their own wiring.
  let control = children;
  if (
    isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>(children) &&
    children.props.id === htmlFor
  ) {
    const props = children.props;
    control = cloneElement(children, {
      "aria-describedby": props["aria-describedby"] ?? describedBy,
      "aria-invalid": props["aria-invalid"] ?? (error ? true : undefined),
    });
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-error">
            *
          </span>
        )}
        {required && <span className="sr-only">(required)</span>}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-surface-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
