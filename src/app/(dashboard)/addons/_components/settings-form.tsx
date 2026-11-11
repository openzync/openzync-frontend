"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  apiErrorMessage,
  putAddonSettings,
  type AddonSettingsProperty,
  type AddonSettingsSchema,
  type ResolvedSettingsGroup,
} from "@/lib/api-client";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { SecretInput } from "@/components/ui/secret-input";
import { SimpleSelect } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

/**
 * Group-aware 422 mapping: loc segments after "values" are either
 * ["<groupId>", "<key>"] (nested group) or ["<key>"] (implicit flat scalar).
 * Errors are keyed `groupId.key` so the form can activate the owning tab.
 */
function groupedErrorsFrom422(
  body: unknown,
  groups: ResolvedSettingsGroup[],
): { errors: Record<string, string>; firstGroupId: string | null } {
  const errors: Record<string, string> = {};
  let firstGroupId: string | null = null;
  if (!body || typeof body !== "object") return { errors, firstGroupId };
  const detail = (body as Record<string, unknown>).detail;
  if (!Array.isArray(detail)) return { errors, firstGroupId };
  const byId = new Map(groups.map((g) => [g.id, g]));
  const note = (groupId: string, key: string, msg: string) => {
    errors[`${groupId}.${key}`] ??= msg;
    firstGroupId ??= groupId;
  };
  for (const item of detail) {
    if (!item || typeof item !== "object") continue;
    const e = item as { loc?: unknown; msg?: unknown };
    if (!Array.isArray(e.loc) || typeof e.msg !== "string") continue;
    const valuesAt = e.loc.indexOf("values");
    const tail = (valuesAt >= 0 ? e.loc.slice(valuesAt + 1) : [...e.loc].reverse())
      .filter((p): p is string => typeof p === "string")
      .filter((p) => p !== "body");
    const segs = valuesAt >= 0 ? tail : [...tail].reverse();
    if (segs.length >= 2 && byId.has(segs[0])) {
      note(segs[0], segs[segs.length - 1], e.msg);
    } else if (segs.length >= 1) {
      const field = segs[segs.length - 1];
      const owner = groups.find((g) => field in (g.properties ?? {})) ?? groups[0];
      if (owner) note(owner.id, field, e.msg);
    }
  }
  return { errors, firstGroupId };
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

/** Seed display values: schema defaults, then stored values win. */
function seedValues(
  properties: Record<string, AddonSettingsProperty>,
  initial: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(properties);
  return {
    ...Object.fromEntries(keys.map((k) => [k, properties[k]?.default ?? initial[k] ?? ""])),
    ...initial,
  };
}

/** Single-field check mirroring the server contract — null when valid. */
function validateField(
  prop: AddonSettingsProperty,
  value: unknown,
  isRequired: boolean,
): string | null {
  if (isRequired && isEmpty(value)) return "This field is required";
  if (isEmpty(value)) return null;
  const allowed = prop.enum;
  if (Array.isArray(allowed) && allowed.length > 0) {
    const bad = Array.isArray(value)
      ? value.some((v) => !allowed.includes(v as string | number | boolean))
      : !allowed.includes(value as string | number | boolean);
    if (bad) return `Must be one of: ${allowed.join(", ")}`;
    return null;
  }
  if (prop.type === "integer" && !(typeof value === "number" && Number.isInteger(value))) {
    const n = typeof value === "string" && value !== "" ? Number(value) : NaN;
    if (!Number.isInteger(n)) return "Must be a whole number";
  } else if (prop.type === "number" && typeof value !== "number") {
    if (value !== "" && Number.isNaN(Number(value))) return "Must be a number";
  } else if (prop.type === "json" && typeof value === "string" && value !== "") {
    try {
      JSON.parse(value);
    } catch {
      return "Must be valid JSON";
    }
  }
  return null;
}

/** Coerce a display value to its wire type — call only after validateField passes. */
function coerceValue(prop: AddonSettingsProperty, value: unknown): unknown {
  if (typeof value === "string") {
    if (prop.type === "json" && value !== "") return JSON.parse(value);
    if (prop.type === "integer" && value !== "") return parseInt(value, 10);
    if (prop.type === "number" && value !== "") return Number(value);
  }
  return value;
}

// ─── Shared field renderer ────────────────────────────────────────────────────

interface SettingFieldProps {
  addonId: string;
  /** DOM id prefix — the flat form uses the addon id; grouped tabs add the group id. */
  idPrefix: string;
  fieldKey: string;
  prop: AddonSettingsProperty;
  value: unknown;
  error?: string;
  required: boolean;
  secretVisible: boolean;
  onChange: (value: unknown) => void;
  onToggleSecretVisibility: () => void;
}

function SettingField({
  addonId,
  idPrefix,
  fieldKey,
  prop,
  value,
  error,
  required,
  secretVisible,
  onChange,
  onToggleSecretVisibility,
}: SettingFieldProps) {
  const id = idPrefix ? `addon-setting-${addonId}-${idPrefix}-${fieldKey}` : `addon-setting-${addonId}-${fieldKey}`;
  const label = prop.title ?? fieldKey;
  const common = "input-base w-full";

  switch (prop.type) {
    case "text":
    case "url":
    case "email":
      return (
        <Field key={fieldKey} label={label} htmlFor={id} hint={prop.description} error={error} required={required}>
          <input
            id={id}
            type={prop.type === "text" ? "text" : prop.type}
            className={common}
            value={typeof value === "string" ? value : (value ?? "") as string}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "textarea":
      return (
        <Field key={fieldKey} label={label} htmlFor={id} hint={prop.description} error={error} required={required}>
          <textarea
            id={id}
            rows={4}
            className={common}
            value={typeof value === "string" ? value : JSON.stringify(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "number":
    case "integer":
      return (
        <Field key={fieldKey} label={label} htmlFor={id} hint={prop.description} error={error} required={required}>
          <input
            id={id}
            type="number"
            step={prop.type === "integer" ? 1 : "any"}
            className={common}
            value={typeof value === "number" ? value : (value ?? "") as string}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
      );
    case "boolean":
      return (
        <div key={fieldKey} className="flex items-start gap-2">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={error ? true : undefined}
            className="mt-1"
          />
          <div>
            <label htmlFor={id} className="text-sm text-text-primary">
              {label}
              {required && (
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
        <Field key={fieldKey} label={label} htmlFor={id} hint={prop.description} error={error} required={required}>
          <SimpleSelect
            id={id}
            options={options.map((opt) => ({ value: String(opt), label: String(opt) }))}
            value={String(value ?? "")}
            onValueChange={(v) => onChange(v)}
          />
        </Field>
      );
    }
    case "multiselect": {
      const options = prop.enum ?? prop.items?.enum ?? [];
      const selected = Array.isArray(value) ? value.map(String) : [];
      const toggle = (opt: string) =>
        onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
      return (
        <fieldset key={fieldKey} aria-describedby={error ? `${id}-error` : undefined}>
          <legend className="text-sm text-text-primary">
            {label}
            {required && (
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
        <div key={fieldKey}>
          <SecretInput
            id={id}
            label={typeof label === "string" ? label : fieldKey}
            value={value === MASKED_SECRET ? "" : typeof value === "string" ? value : ""}
            onChange={(v) => onChange(v)}
            placeholder={MASKED_SECRET}
            visible={secretVisible}
            onToggleVisibility={onToggleSecretVisibility}
            optional={!required}
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
        <Field key={fieldKey} label={label} htmlFor={id} hint={prop.description} error={error} required={required}>
          <textarea
            id={id}
            rows={5}
            spellCheck={false}
            className={`${common} font-mono text-xs`}
            value={typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "date":
      return (
        <Field key={fieldKey} label={label} htmlFor={id} hint={prop.description} error={error} required={required}>
          <input
            id={id}
            type="date"
            className={common}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    default:
      return (
        <p key={fieldKey} role="alert" className="flex items-center gap-1.5 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>Unsupported field type “{prop.type}” for setting “{fieldKey}” — contact the add-on author.</span>
        </p>
      );
  }
}

interface SettingsFieldsProps {
  addonId: string;
  idPrefix: string;
  properties: Record<string, AddonSettingsProperty>;
  required: Set<string>;
  values: Record<string, unknown>;
  /** Keyed by bare field key. */
  errors: Record<string, string>;
  visibleSecrets: Record<string, boolean>;
  onChange: (key: string, value: unknown) => void;
  onToggleSecretVisibility: (key: string) => void;
}

/** Optional group scope: the field list for one group's properties/required/values. */
export function AddonSettingsFields({
  addonId,
  idPrefix,
  properties,
  required,
  values,
  errors,
  visibleSecrets,
  onChange,
  onToggleSecretVisibility,
}: SettingsFieldsProps) {
  return (
    <>
      {Object.keys(properties).map((key) => (
        <SettingField
          key={key}
          addonId={addonId}
          idPrefix={idPrefix}
          fieldKey={key}
          prop={properties[key] ?? { type: "text" }}
          value={values[key]}
          error={errors[key]}
          required={required.has(key)}
          secretVisible={visibleSecrets[key] === true}
          onChange={(v) => onChange(key, v)}
          onToggleSecretVisibility={() => onToggleSecretVisibility(key)}
        />
      ))}
    </>
  );
}

// ─── Flat form (single group / panel-widget form) ────────────────────────────

export function AddonSettingsForm({ addonId, schema, initialValues, onSaved }: SettingsFormProps) {
  const properties = useMemo(() => schema.properties ?? {}, [schema]);
  const required = useMemo(() => new Set(schema.required ?? []), [schema]);
  const keys = useMemo(() => Object.keys(properties), [properties]);

  const [values, setValues] = useState<Record<string, unknown>>(() => seedValues(properties, initialValues));
  // Snapshot of the last-saved display values — the parent remounts this form
  // (key change) after every save, so the mount-time snapshot is the baseline.
  // PUT sends full values, so there is no staged-reset hook to adopt here.
  const [snapshot] = useState<Record<string, unknown>>(() => seedValues(properties, initialValues));
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
      const message = validateField(properties[key], values[key], required.has(key));
      if (message) next[key] = message;
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
        const value = values[key];
        // Empty secret = keep the stored value — never send the mask back.
        if (prop.type === "secret" && (value === "" || value === MASKED_SECRET)) continue;
        payload[key] = coerceValue(prop, value);
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
      {/* idPrefix "" preserves the historic flat-form DOM ids (addon-setting-{id}-{key}). */}
      <AddonSettingsFields
        addonId={addonId}
        idPrefix=""
        properties={properties}
        required={required}
        values={values}
        errors={errors}
        visibleSecrets={visibleSecrets}
        onChange={set}
        onToggleSecretVisibility={(key) => setVisibleSecrets((v) => ({ ...v, [key]: !(v[key] === true) }))}
      />

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

// ─── Grouped form (multi-group settings) ─────────────────────────────────────
// Whole-form state + a single save bar + a single PUT live here: per-group
// field edits report up per key with their group path, dirty tracking spans
// all groups, and 422s keyed `group.key` activate the owning tab.

interface GroupedSettingsFormProps {
  addonId: string;
  schema: AddonSettingsSchema;
  groups: ResolvedSettingsGroup[];
  /** Raw server root values — unclaimed keys ride through the PUT verbatim. */
  rootValues?: Record<string, unknown>;
  /** Called with the saved values after a successful PUT (parent refetches). */
  onSaved?: (values: Record<string, unknown>) => void;
}

/**
 * Build the nested PUT shape from schema structure: fields whose group id is
 * a `type: object` schema property nest as `{groupId: {...}}`; every other
 * (implicit-group) scalar stays flat at the top level. Root keys claimed by
 * no group ride through verbatim.
 */
function buildGroupedPayload(
  schema: AddonSettingsSchema,
  groups: ResolvedSettingsGroup[],
  values: Record<string, Record<string, unknown>>,
  rootValues: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const claimed = new Set<string>();
  for (const group of groups) {
    claimed.add(group.id);
    const nested = schema.properties?.[group.id]?.type === "object";
    for (const key of Object.keys(group.properties)) {
      claimed.add(key);
      const prop = group.properties[key];
      const value = values[group.id]?.[key];
      // Empty secret = keep the stored value — never send the mask back.
      if (prop.type === "secret" && (value === "" || value === MASKED_SECRET)) continue;
      const coerced = coerceValue(prop, value);
      if (nested) {
        payload[group.id] = { ...((payload[group.id] as Record<string, unknown>) ?? {}), [key]: coerced };
      } else {
        payload[key] = coerced;
      }
    }
  }
  for (const [key, value] of Object.entries(rootValues)) {
    if (!(key in payload) && !claimed.has(key)) payload[key] = value;
  }
  return payload;
}

export function GroupedAddonSettingsForm({ addonId, schema, groups, rootValues, onSaved }: GroupedSettingsFormProps) {
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, seedValues(g.properties, g.values)])),
  );
  const [snapshot] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, seedValues(g.properties, g.values)])),
  );
  // Errors keyed `groupId.key` so the owning tab can be activated + inlined.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? "");
  const { setDirty } = useConfigDirty();

  const requiredByGroup = useMemo(
    () => new Map(groups.map((g) => [g.id, new Set(g.required ?? [])])),
    [groups],
  );
  const groupKeys = useMemo(() => groups.map((g) => g.id), [groups]);

  const hasChanges = groups.some((g) =>
    Object.keys(g.properties).some((k) => !valuesEqual(values[g.id]?.[k], snapshot[g.id]?.[k])),
  );

  /** Per-key edit reporting with the group path; dirty tracking spans groups. */
  const setField = (groupId: string, key: string, value: unknown) => {
    setValues((v) => {
      const next = { ...v, [groupId]: { ...v[groupId], [key]: value } };
      setDirty(
        groups.some((g) =>
          Object.keys(g.properties).some((k) => !valuesEqual(next[g.id]?.[k], snapshot[g.id]?.[k])),
        ),
      );
      return next;
    });
    const errorKey = `${groupId}.${key}`;
    setErrors((e) => {
      if (!(errorKey in e)) return e;
      const next = { ...e };
      delete next[errorKey];
      return next;
    });
  };

  const validate = (): { errors: Record<string, string>; firstGroupId: string | null } => {
    const next: Record<string, string> = {};
    let firstGroupId: string | null = null;
    for (const group of groups) {
      const required = requiredByGroup.get(group.id) ?? new Set<string>();
      for (const key of Object.keys(group.properties)) {
        const message = validateField(group.properties[key], values[group.id]?.[key], required.has(key));
        if (message) {
          next[`${group.id}.${key}`] = message;
          firstGroupId ??= group.id;
        }
      }
    }
    return { errors: next, firstGroupId };
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const client = validate();
    setErrors(client.errors);
    setSubmitError(null);
    if (Object.keys(client.errors).length > 0) {
      if (client.firstGroupId) setActiveGroup(client.firstGroupId);
      return;
    }
    setSaving(true);
    try {
      const payload = buildGroupedPayload(schema, groups, values, rootValues ?? {});
      const saved = await putAddonSettings(addonId, payload);
      toast.success("Settings saved");
      setDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      onSaved?.(saved.values);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const mapped = groupedErrorsFrom422(err.body, groups);
        if (Object.keys(mapped.errors).length > 0) {
          setErrors(mapped.errors);
          if (mapped.firstGroupId) setActiveGroup(mapped.firstGroupId);
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
    setValues(Object.fromEntries(groupKeys.map((id) => [id, { ...snapshot[id] }])));
    setErrors({});
    setSubmitError(null);
    setDirty(false);
  };

  const active = groups.find((g) => g.id === activeGroup) ?? groups[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Group tabs sit above the settings card; the panel tabs below are a
          separate Tabs tree, so equal titles render in both rows unmerged. */}
      <Tabs value={active?.id} onValueChange={setActiveGroup} variant="pill">
        <TabsList aria-label={`${addonId} settings groups`}>
          {groups.map((group) => (
            <TabsTrigger key={group.id} value={group.id}>
              {group.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {groups.map((group) => {
          const required = requiredByGroup.get(group.id) ?? new Set<string>();
          const groupErrors: Record<string, string> = {};
          for (const [k, msg] of Object.entries(errors)) {
            if (k.startsWith(`${group.id}.`)) {
              groupErrors[k.slice(group.id.length + 1)] = msg;
            }
          }
          const groupVisible: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(visibleSecrets)) {
            if (k.startsWith(`${group.id}.`)) {
              groupVisible[k.slice(group.id.length + 1)] = v;
            }
          }
          return (
            <TabsContent key={group.id} value={group.id} className="pt-2">
              <div className="card-base space-y-4 p-4">
                <div>
                  <h2 className="font-display text-base font-medium text-text-primary">{group.title}</h2>
                  {group.description && <p className="mt-0.5 text-xs text-surface-400">{group.description}</p>}
                </div>
                {Object.keys(group.properties).length === 0 ? (
                  <p className="text-sm text-surface-400" role="status">This section has no configurable settings.</p>
                ) : (
                  <AddonSettingsFields
                    addonId={addonId}
                    idPrefix={group.id}
                    properties={group.properties}
                    required={required}
                    values={values[group.id] ?? {}}
                    errors={groupErrors}
                    visibleSecrets={groupVisible}
                    onChange={(key, v) => setField(group.id, key, v)}
                    onToggleSecretVisibility={(key) =>
                      setVisibleSecrets((v) => ({ ...v, [`${group.id}.${key}`]: !(v[`${group.id}.${key}`] === true) }))
                    }
                  />
                )}

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
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </form>
  );
}
