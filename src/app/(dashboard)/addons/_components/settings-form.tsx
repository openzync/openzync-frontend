"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiErrorMessage, putAddonSettings, type AddonSettingsSchema } from "@/lib/api-client";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { SecretInput } from "@/components/ui/secret-input";
import { SimpleSelect } from "@/components/ui/select";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";

interface SettingsFormProps {
  addonId: string;
  schema: AddonSettingsSchema;
  initialValues: Record<string, unknown>;
  /** Called with the saved values after a successful PUT (parent refetches). */
  onSaved?: (values: Record<string, unknown>) => void;
}

const MASKED_SECRET = "***";

/** Pull per-field messages out of a FastAPI 422 `detail` array. */
function fieldErrorsFrom422(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!body || typeof body !== "object") return out;
  const detail = (body as Record<string, unknown>).detail;
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    if (!item || typeof item !== "object") continue;
    const e = item as { loc?: unknown; msg?: unknown };
    if (!Array.isArray(e.loc) || typeof e.msg !== "string") continue;
    // loc looks like ["body", "values", "<field>"] — the field is the tail.
    const field = [...e.loc].reverse().find((p) => typeof p === "string");
    if (typeof field === "string" && field !== "values" && field !== "body") {
      out[field] ??= e.msg;
    }
  }
  return out;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Display-level equality: masked secrets ("***") count as empty (keep-stored). */
function valuesEqual(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === MASKED_SECRET ? "" : v);
  const x = norm(a);
  const y = norm(b);
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) return false;
    const sx = [...x].map(String).sort();
    const sy = [...y].map(String).sort();
    return sx.every((v, i) => v === sy[i]);
  }
  return x === y;
}

export function AddonSettingsForm({ addonId, schema, initialValues, onSaved }: SettingsFormProps) {
  const properties = useMemo(() => schema.properties ?? {}, [schema]);
  const required = useMemo(() => new Set(schema.required ?? []), [schema]);
  const keys = useMemo(() => Object.keys(properties), [properties]);

  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(keys.map((k) => [k, properties[k]?.default ?? initialValues[k] ?? ""])),
    ...initialValues,
  }));
  // Snapshot of the last-saved display values — the parent remounts this form
  // (key change) after every save, so the mount-time snapshot is the baseline.
  // PUT sends full values, so there is no staged-reset hook to adopt here.
  const [snapshot] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(keys.map((k) => [k, properties[k]?.default ?? initialValues[k] ?? ""])),
    ...initialValues,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  // ConfigDirtyProvider lives at the dashboard layout level, which covers
  // /addons routes — no local provider needed.
  const { setDirty } = useConfigDirty();

  const hasChanges = keys.some((k) => !valuesEqual(values[k], snapshot[k]));

  const set = (key: string, value: unknown) => {
    setValues((v) => {
      const next = { ...v, [key]: value };
      setDirty(keys.some((k) => !valuesEqual(next[k], snapshot[k])));
      return next;
    });
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  /** Client-side required/enum checks mirroring the server contract. */
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const key of keys) {
      const prop = properties[key];
      const value = values[key];
      if (required.has(key) && isEmpty(value)) {
        next[key] = "This field is required";
        continue;
      }
      if (isEmpty(value)) continue;
      const allowed = prop.enum;
      if (Array.isArray(allowed) && allowed.length > 0) {
        const bad = Array.isArray(value)
          ? value.some((v) => !allowed.includes(v as string | number | boolean))
          : !allowed.includes(value as string | number | boolean);
        if (bad) next[key] = `Must be one of: ${allowed.join(", ")}`;
        continue;
      }
      if (prop.type === "integer" && !(typeof value === "number" && Number.isInteger(value))) {
        const n = typeof value === "string" && value !== "" ? Number(value) : NaN;
        if (!Number.isInteger(n)) next[key] = "Must be a whole number";
      } else if (prop.type === "number" && typeof value !== "number") {
        if (value !== "" && Number.isNaN(Number(value))) next[key] = "Must be a number";
      } else if (prop.type === "json" && typeof value === "string" && value !== "") {
        try {
          JSON.parse(value);
        } catch {
          next[key] = "Must be valid JSON";
        }
      }
    }
    return next;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setSubmitError(null);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const key of keys) {
        const prop = properties[key];
        let value = values[key];
        // Empty secret = keep the stored value — never send the mask back.
        if (prop.type === "secret" && (value === "" || value === MASKED_SECRET)) continue;
        if (typeof value === "string") {
          if (prop.type === "json" && value !== "") value = JSON.parse(value);
          else if (prop.type === "integer" && value !== "") value = parseInt(value, 10);
          else if (prop.type === "number" && value !== "") value = Number(value);
        }
        payload[key] = value;
      }
      const saved = await putAddonSettings(addonId, payload);
      toast.success("Settings saved");
      setDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      onSaved?.(saved.values);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const perField = fieldErrorsFrom422(err.body);
        if (Object.keys(perField).length > 0) {
          setErrors(perField);
          setSubmitError("Some fields need attention — see below.");
        } else {
          setSubmitError(apiErrorMessage(err, "Settings were rejected by the server"));
        }
      } else {
        setSubmitError(apiErrorMessage(err, "Failed to save settings"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setValues({ ...snapshot });
    setErrors({});
    setSubmitError(null);
    setDirty(false);
  };

  // Card heading mirrors the org-config LLM provider cards (title + subtext
  // + fields in one section). Falls back to "{id} Settings" when the schema
  // carries no title — the schema type holds them via its index signature.
  const sectionTitle =
    typeof schema.title === "string" && schema.title ? schema.title : `${addonId} Settings`;
  const sectionDescription =
    typeof schema.description === "string" ? schema.description : undefined;

  if (keys.length === 0) {
    return (
      <div className="card-base space-y-1 p-4" role="status">
        <h2 className="font-display text-base font-medium text-text-primary">{sectionTitle}</h2>
        {sectionDescription && <p className="text-xs text-surface-400">{sectionDescription}</p>}
        <p className="text-sm text-surface-400">This add-on has no configurable settings.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-base space-y-4 p-4" noValidate>
      <div>
        <h2 className="font-display text-base font-medium text-text-primary">{sectionTitle}</h2>
        {sectionDescription && <p className="mt-0.5 text-xs text-surface-400">{sectionDescription}</p>}
      </div>
      {keys.map((key) => {
        const prop = properties[key] ?? { type: "text" };
        const id = `addon-setting-${addonId}-${key}`;
        const label = prop.title ?? key;
        const error = errors[key];
        const common = "input-base w-full";
        const value = values[key];

        switch (prop.type) {
          case "text":
          case "url":
          case "email":
            return (
              <Field key={key} label={label} htmlFor={id} hint={prop.description} error={error} required={required.has(key)}>
                <input
                  id={id}
                  type={prop.type === "text" ? "text" : prop.type}
                  className={common}
                  value={typeof value === "string" ? value : (value ?? "") as string}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            );
          case "textarea":
            return (
              <Field key={key} label={label} htmlFor={id} hint={prop.description} error={error} required={required.has(key)}>
                <textarea
                  id={id}
                  rows={4}
                  className={common}
                  value={typeof value === "string" ? value : JSON.stringify(value ?? "")}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            );
          case "number":
          case "integer":
            return (
              <Field key={key} label={label} htmlFor={id} hint={prop.description} error={error} required={required.has(key)}>
                <input
                  id={id}
                  type="number"
                  step={prop.type === "integer" ? 1 : "any"}
                  className={common}
                  value={typeof value === "number" ? value : (value ?? "") as string}
                  onChange={(e) => set(key, e.target.value === "" ? "" : Number(e.target.value))}
                />
              </Field>
            );
          case "boolean":
            return (
              <div key={key} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  checked={value === true}
                  onCheckedChange={(checked) => set(key, checked === true)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  aria-invalid={error ? true : undefined}
                  className="mt-1"
                />
                <div>
                  <label htmlFor={id} className="text-sm text-text-primary">
                    {label}
                    {required.has(key) && (
                      <>
                        <span aria-hidden="true" className="ml-0.5 text-error">*</span>
                        <span className="sr-only">(required)</span>
                      </>
                    )}
                  </label>
                  {prop.description && !error && <p className="text-xs text-surface-500">{prop.description}</p>}
                  {error && <p id={`${id}-error`} className="text-xs text-error" role="alert">{error}</p>}
                </div>
              </div>
            );
          case "select": {
            const options = prop.enum ?? [];
            return (
              <Field key={key} label={label} htmlFor={id} hint={prop.description} error={error} required={required.has(key)}>
                <SimpleSelect
                  id={id}
                  options={options.map((opt) => ({ value: String(opt), label: String(opt) }))}
                  value={String(value ?? "")}
                  onValueChange={(v) => set(key, v)}
                />
              </Field>
            );
          }
          case "multiselect": {
            const options = prop.enum ?? prop.items?.enum ?? [];
            const selected = Array.isArray(value) ? value.map(String) : [];
            const toggle = (opt: string) =>
              set(key, selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
            return (
              <fieldset key={key} aria-describedby={error ? `${id}-error` : undefined}>
                <legend className="text-sm text-text-primary">
                  {label}
                  {required.has(key) && (
                    <>
                      <span aria-hidden="true" className="ml-0.5 text-error">*</span>
                      <span className="sr-only">(required)</span>
                    </>
                  )}
                </legend>
                {prop.description && !error && <p className="text-xs text-surface-500">{prop.description}</p>}
                <div className="mt-1.5 space-y-1.5">
                  {options.map((opt) => {
                    const optStr = String(opt);
                    const optId = `${id}-${optStr}`;
                    return (
                      <div key={optStr} className="flex items-center gap-2">
                        <Checkbox
                          id={optId}
                          checked={selected.includes(optStr)}
                          onCheckedChange={() => toggle(optStr)}
                        />
                        <label htmlFor={optId} className="text-sm text-text-secondary">{optStr}</label>
                      </div>
                    );
                  })}
                </div>
                {error && <p id={`${id}-error`} className="text-xs text-error" role="alert">{error}</p>}
              </fieldset>
            );
          }
          case "secret": {
            const secretHint = prop.description ?? "Leave blank to keep the current value.";
            const secretError = error ? `${id}-error` : undefined;
            return (
              <div key={key}>
                <SecretInput
                  id={id}
                  label={typeof label === "string" ? label : key}
                  value={value === MASKED_SECRET ? "" : typeof value === "string" ? value : ""}
                  onChange={(v) => set(key, v)}
                  placeholder={MASKED_SECRET}
                  visible={visibleSecrets[key] === true}
                  onToggleVisibility={() =>
                    setVisibleSecrets((v) => ({ ...v, [key]: !(v[key] === true) }))
                  }
                  optional={!required.has(key)}
                />
                {secretHint && !error && (
                  <p id={`${id}-hint`} className="mt-1.5 text-xs text-surface-500">
                    {secretHint}
                  </p>
                )}
                {error && (
                  <p id={secretError} className="mt-1.5 text-xs text-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            );
          }
          case "json":
            return (
              <Field key={key} label={label} htmlFor={id} hint={prop.description} error={error} required={required.has(key)}>
                <textarea
                  id={id}
                  rows={5}
                  spellCheck={false}
                  className={`${common} font-mono text-xs`}
                  value={typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            );
          case "date":
            return (
              <Field key={key} label={label} htmlFor={id} hint={prop.description} error={error} required={required.has(key)}>
                <input
                  id={id}
                  type="date"
                  className={common}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            );
          default:
            return (
              <p key={key} role="alert" className="flex items-center gap-1.5 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                <span>Unsupported field type “{prop.type}” for setting “{key}” — contact the add-on author.</span>
              </p>
            );
        }
      })}

      {submitError && (
        <p role="alert" className="flex items-center gap-1.5 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </p>
      )}

      <StickySaveBar
        saving={saving}
        hasChanges={hasChanges}
        hasSaved={justSaved}
        onSave={() => void handleSubmit()}
        onDiscard={handleDiscard}
      />
    </form>
  );
}
