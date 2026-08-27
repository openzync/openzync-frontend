"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/components/ui/field";

interface PasswordFieldProps {
  /** Input id — must be unique on the page; wired to the label via Field. */
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  error?: string;
  hint?: string;
  /**
   * Controlled visibility — pass together with onToggleVisibility to share
   * one toggle state across related fields (e.g. password + confirm).
   * Omit both for self-managed state.
   */
  visible?: boolean;
  onToggleVisibility?: () => void;
  autoFocus?: boolean;
}

/**
 * Password input with accessibility-wired eye toggle. Replaces the six
 * copy-pasted visibility toggles; label association comes from Field.
 *
 * Hint/error ids mirror Field's deterministic `${htmlFor}-hint`/-error`
 * scheme so the input can carry aria-describedby itself (the element Field
 * clones here is the positioning wrapper, not the input).
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  required,
  error,
  hint,
  visible,
  onToggleVisibility,
  autoFocus,
}: PasswordFieldProps) {
  const [internalVisible, setInternalVisible] = useState(false);
  const isControlled = visible !== undefined && onToggleVisibility !== undefined;
  const isVisible = isControlled ? visible : internalVisible;

  const toggle = () => {
    if (isControlled) onToggleVisibility();
    else setInternalVisible((prev) => !prev);
  };

  // Same derivation as Field — kept in sync by construction.
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="input-base w-full pr-10"
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-text-primary"
        >
          {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );
}
