"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SchemaBuilderInput } from "./schema-builder";

// ─── Types ───────────────────────────────────────────────────────────────────

export const LABEL_SECTIONS = ["intent", "emotion", "valence", "arousal"] as const;

export type LabelSection = (typeof LABEL_SECTIONS)[number];

export type LabelSets = Record<LabelSection, string[]>;

export interface LabelSetBuilderProps {
  initialName?: string;
  initialLabels?: Partial<Record<LabelSection, string[]>>;
  initialPromptTemplate?: string;
  submitLabel: string;
  onSubmit: (input: SchemaBuilderInput) => Promise<void>;
}

const SECTION_META: Record<
  LabelSection,
  { title: string; hint: string; placeholder: string }
> = {
  intent: {
    title: "Intent",
    hint: "What the speaker wants to do.",
    placeholder: "e.g. book_flight",
  },
  emotion: {
    title: "Emotion",
    hint: "How the speaker feels.",
    placeholder: "e.g. frustration",
  },
  valence: {
    title: "Valence",
    hint: "Overall sentiment polarity.",
    placeholder: "e.g. negative",
  },
  arousal: {
    title: "Arousal",
    hint: "Emotional intensity level.",
    placeholder: "e.g. high",
  },
};

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_\- ]*$/;

// ─── Label-set ↔ json_schema conversion ──────────────────────────────────────

function cleanList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

/** Pull the four optional label arrays out of a stored classification schema. */
export function labelsFromJsonSchema(jsonSchema: unknown): LabelSets {
  const empty: LabelSets = { intent: [], emotion: [], valence: [], arousal: [] };
  if (!jsonSchema || typeof jsonSchema !== "object") return empty;
  const record = jsonSchema as Record<string, unknown>;
  for (const section of LABEL_SECTIONS) {
    empty[section] = cleanList(record[section]);
  }
  return empty;
}

/** Fold label sets into a classification schema, omitting empty sections. */
export function buildClassificationSchema(
  labels: LabelSets,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {};
  for (const section of LABEL_SECTIONS) {
    const cleaned = labels[section].map((l) => l.trim()).filter(Boolean);
    if (cleaned.length > 0) schema[section] = cleaned;
  }
  return schema;
}

/** Total label count across all four sections — tolerates missing keys. */
export function labelCountOf(jsonSchema: unknown): number {
  const labels = labelsFromJsonSchema(jsonSchema);
  return LABEL_SECTIONS.reduce((n, s) => n + labels[s].length, 0);
}

// ─── Save-error parsing (per-field) ─────────────────────────────────────────

export interface LabelSaveErrors {
  fieldErrors: Record<string, string>;
  labelsError: string | null;
  formError: string | null;
}

const EMPTY_SAVE_ERRORS: LabelSaveErrors = {
  fieldErrors: {},
  labelsError: null,
  formError: null,
};

/** Map a failed create/update into name/prompt/labels-level messages. */
function parseSaveError(err: unknown): LabelSaveErrors {
  if (!(err instanceof ApiError)) {
    return {
      ...EMPTY_SAVE_ERRORS,
      formError: err instanceof Error ? err.message : "Failed to save schema",
    };
  }
  const body = err.body as Record<string, unknown> | null;
  const details =
    body && Array.isArray(body.detail)
      ? (body.detail as Array<Record<string, unknown>>)
      : [];
  // 409 name conflict without a detail array (e.g. `{detail: "…"}`) → name.
  if (details.length === 0) {
    if (err.status === 409)
      return { ...EMPTY_SAVE_ERRORS, fieldErrors: { name: err.message } };
    return { ...EMPTY_SAVE_ERRORS, formError: err.message };
  }
  const fieldErrors: Record<string, string> = {};
  let labelsError: string | null = null;
  let formError: string | null = null;
  for (const item of details.slice(0, 5)) {
    const loc = Array.isArray(item.loc)
      ? item.loc.filter((p): p is string => typeof p === "string")
      : [];
    const msg = typeof item.msg === "string" ? item.msg : err.message;
    const target = loc[1] ?? loc[0] ?? "";
    if (target === "name") fieldErrors.name ??= msg;
    else if (target === "prompt_template") fieldErrors.prompt_template ??= msg;
    else if (
      target === "json_schema" ||
      (LABEL_SECTIONS as readonly string[]).includes(target)
    )
      labelsError ??= `Labels: ${msg}`;
    else formError ??= loc.length > 1 ? `${loc.slice(1).join(".")}: ${msg}` : msg;
  }
  return {
    fieldErrors,
    labelsError,
    formError: formError ?? (labelsError ? null : err.message),
  };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function LabelSetBuilder({
  initialName = "",
  initialLabels = {},
  initialPromptTemplate = "",
  submitLabel,
  onSubmit,
}: LabelSetBuilderProps) {
  const [name, setName] = useState(initialName);
  const [promptTemplate, setPromptTemplate] = useState(initialPromptTemplate);
  const [labels, setLabels] = useState<LabelSets>(() => ({
    ...labelsFromJsonSchema(undefined),
    intent: cleanList(initialLabels.intent),
    emotion: cleanList(initialLabels.emotion),
    valence: cleanList(initialLabels.valence),
    arousal: cleanList(initialLabels.arousal),
  }));
  const [drafts, setDrafts] = useState<Record<LabelSection, string>>({
    intent: "",
    emotion: "",
    valence: "",
    arousal: "",
  });
  const [saveErrors, setSaveErrors] =
    useState<LabelSaveErrors>(EMPTY_SAVE_ERRORS);
  const [saving, setSaving] = useState(false);

  const jsonSchema = useMemo(() => buildClassificationSchema(labels), [labels]);
  const previewJson = useMemo(
    () => JSON.stringify(jsonSchema, null, 2),
    [jsonSchema],
  );
  const totalLabels = useMemo(
    () => LABEL_SECTIONS.reduce((n, s) => n + labels[s].length, 0),
    [labels],
  );

  const addLabel = (section: LabelSection) => {
    const value = drafts[section].trim();
    if (!value) return;
    if (
      labels[section].some((l) => l.toLowerCase() === value.toLowerCase())
    ) {
      setSaveErrors((prev) => ({
        ...prev,
        labelsError: `Duplicate label “${value}” in ${SECTION_META[section].title}`,
      }));
      return;
    }
    setLabels((prev) => ({ ...prev, [section]: [...prev[section], value] }));
    setDrafts((prev) => ({ ...prev, [section]: "" }));
    setSaveErrors((prev) => ({ ...prev, labelsError: null }));
  };

  const removeLabel = (section: LabelSection, index: number) => {
    setLabels((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }));
  };

  const validateLocal = (): { name?: string; labels?: string } => {
    const errors: { name?: string; labels?: string } = {};
    if (!name.trim()) errors.name = "Name is required";
    else if (!NAME_PATTERN.test(name.trim())) {
      errors.name = "Start with a letter; letters, numbers, spaces, _ and - only";
    }
    if (totalLabels === 0) {
      errors.labels = "Add at least one label in any section";
    } else {
      for (const section of LABEL_SECTIONS) {
        const seen = new Set<string>();
        for (const label of labels[section]) {
          const trimmed = label.trim();
          if (!trimmed) {
            errors.labels = `Empty label in ${SECTION_META[section].title} — remove it or type a value`;
            break;
          }
          const key = trimmed.toLowerCase();
          if (seen.has(key)) {
            errors.labels = `Duplicate label “${trimmed}” in ${SECTION_META[section].title}`;
            break;
          }
          seen.add(key);
        }
        if (errors.labels) break;
      }
    }
    return errors;
  };

  const handleSave = async () => {
    const localErrors = validateLocal();
    if (localErrors.name ?? localErrors.labels) {
      setSaveErrors({
        fieldErrors: localErrors.name ? { name: localErrors.name } : {},
        labelsError: localErrors.labels ?? null,
        formError: null,
      });
      return;
    }
    setSaving(true);
    setSaveErrors(EMPTY_SAVE_ERRORS);
    try {
      await onSubmit({
        name: name.trim(),
        json_schema: jsonSchema,
        prompt_template: promptTemplate.trim() ? promptTemplate.trim() : null,
      });
    } catch (err) {
      const parsed = parseSaveError(err);
      setSaveErrors(parsed);
      toast.error(
        parsed.formError ?? parsed.labelsError ?? "Failed to save schema",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Identity card ─────────────────────────────────────────────── */}
      <div className="card-base p-5 space-y-4">
        <Field
          label="Schema name"
          htmlFor="label-set-name"
          required
          hint="Start with a letter; letters, numbers, spaces, _ and - only."
          error={saveErrors.fieldErrors.name}
        >
          <input
            id="label-set-name"
            className="input-base"
            placeholder="e.g. support_dialog_labels"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaveErrors((prev) => ({
                ...prev,
                fieldErrors: { ...prev.fieldErrors, name: "" },
              }));
            }}
            autoFocus
          />
        </Field>
        <Field
          label="Prompt template"
          htmlFor="label-set-prompt"
          hint="Optional override — injected into the classification prompt for this schema."
          error={saveErrors.fieldErrors.prompt_template}
        >
          <textarea
            id="label-set-prompt"
            className="input-base min-h-[80px] pt-2 font-mono text-xs"
            placeholder="Classify the dialog using these label sets…"
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
          />
        </Field>
      </div>

      {/* ── Label sets + sticky preview ───────────────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card-base min-w-0 divide-y divide-surface-800 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-primary">
              Label sets{" "}
              <span className="text-xs font-normal text-surface-500">
                ({totalLabels} defined)
              </span>
            </h2>
            <Badge variant="default" size="sm">
              classification
            </Badge>
          </div>

          {saveErrors.labelsError && (
            <p className="mb-3 text-xs text-error" role="alert">
              {saveErrors.labelsError}
            </p>
          )}

          {LABEL_SECTIONS.map((section) => {
            const meta = SECTION_META[section];
            return (
              <section key={section} aria-label={`${meta.title} labels`} className="py-4 first:pt-0 last:pb-0">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-text-primary">
                    {meta.title}{" "}
                    <span className="text-xs font-normal text-surface-500">
                      ({labels[section].length})
                    </span>
                  </h3>
                  <span className="text-xs text-surface-500">{meta.hint}</span>
                </div>
                {labels[section].length > 0 && (
                  <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={`${meta.title} label list`}>
                    {labels[section].map((label, index) => (
                      <li
                        key={`${label}-${index}`}
                        className="inline-flex items-center gap-1 rounded-full border border-surface-700 bg-surface-950 py-0.5 pl-2.5 pr-1 text-xs text-surface-200"
                      >
                        <span className="font-mono">{label}</span>
                        <button
                          type="button"
                          onClick={() => removeLabel(section, index)}
                          className="cursor-pointer rounded-full p-0.5 text-surface-500 transition-colors hover:text-error focus-visible:outline-2 focus-visible:outline-accent-300"
                          aria-label={`Remove “${label}” from ${meta.title}`}
                        >
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <label htmlFor={`label-set-${section}-input`} className="sr-only">
                    Add {meta.title} label
                  </label>
                  <input
                    id={`label-set-${section}-input`}
                    className="input-base font-mono text-xs"
                    placeholder={meta.placeholder}
                    value={drafts[section]}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [section]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addLabel(section);
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => addLabel(section)}
                    aria-label={`Add label to ${meta.title}`}
                  >
                    Add
                  </Button>
                </div>
              </section>
            );
          })}
        </div>

        <div className="min-w-0 lg:sticky lg:top-6">
          {/* Live JSON preview */}
          <div className="card-base p-5">
            <h2 className="mb-1 text-sm font-medium text-text-primary">Live preview</h2>
            <p className="mb-3 text-xs text-surface-500">
              Read-only — generated from the label sets on the left. Empty sections are omitted.
            </p>
            <pre
              className="max-h-72 overflow-auto rounded-lg bg-surface-950 p-3 font-mono text-xs text-surface-300"
              aria-label="Generated classification schema"
              aria-live="polite"
            >
              {previewJson}
            </pre>
          </div>
        </div>
      </div>

      {/* ── Save bar ──────────────────────────────────────────────────── */}
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        {saveErrors.formError ? (
          <p className="text-xs text-error" role="alert">{saveErrors.formError}</p>
        ) : (
          <p className="text-xs text-surface-500">
            {totalLabels} label{totalLabels === 1 ? "" : "s"} · saved as a classification schema
          </p>
        )}
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
