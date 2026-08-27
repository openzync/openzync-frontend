"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecretInputProps {
  /** Input id — wires label htmlFor ↔ input id. Required for new call sites. */
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisibility: () => void;
}

export function SecretInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisibility,
}: SecretInputProps) {
  const isEmpty = !value;

  return (
    <div>
      <label className="block text-sm font-medium text-surface-300 mb-1.5" htmlFor={id}>
        {label}
        {isEmpty && (
          <span className="ml-2 text-[10px] font-medium text-error uppercase tracking-wider">Required</span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(
            "input-base pr-10 w-full",
            isEmpty && "border-error/40 focus:border-error",
          )}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
