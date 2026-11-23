"use client";

/**
 * Non-secret system defaults rendered as label + input for the
 * superadmin System Config page.
 *
 * Field names mirror the org-config `stored` map so the values round-trip
 * through PATCH unchanged. Secrets (API keys) are deliberately NOT listed.
 */

import { Field } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";

export interface ConfigFieldMeta {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  hint?: string;
}

export const SYSTEM_DEFAULT_FIELDS: ConfigFieldMeta[] = [];

export function ConfigFields({
  values,
  onChange,
  disabled = false,
}: {
  values: Record<string, unknown>;
  onChange: (key: string, value: string | number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4 max-w-md">
      {SYSTEM_DEFAULT_FIELDS.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          htmlFor={`system-default-${field.key}`}
          hint={field.hint}
        >
          {field.kind === "select" ? (
            <SimpleSelect
              id={`system-default-${field.key}`}
              className="w-full"
              options={(field.options ?? []).map((opt) => ({
                ...opt,
                value: opt.value === "" ? "__none__" : opt.value,
              }))}
              value={
                String(values[field.key] ?? "") === ""
                  ? "__none__"
                  : String(values[field.key] ?? "")
              }
              disabled={disabled}
              onValueChange={(value) =>
                onChange(field.key, value === "__none__" ? "" : value)
              }
            />
          ) : (
            <input
              id={`system-default-${field.key}`}
              className="input-base w-full"
              type={field.kind === "number" ? "number" : "text"}
              value={String(values[field.key] ?? "")}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  field.key,
                  field.kind === "number"
                    ? parseFloat(e.target.value) || 0
                    : e.target.value,
                )
              }
            />
          )}
        </Field>
      ))}
    </div>
  );
}
