"use client";

import { useMemo, useState } from "react";
import { FlaskConical, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  getTemplates,
  previewSchema,
  type SchemaTemplate,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SchemaFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

export interface SchemaField {
  id: string;
  name: string;
  type: SchemaFieldType;
  required: boolean;
  description: string;
}

export interface SchemaBuilderInput {
  name: string;
  json_schema: Record<string, unknown>;
  prompt_template: string | null;
}

interface BuilderTemplate {
  name: string;
  description: string;
  fields: SchemaField[];
  sampleText: string;
}

const FIELD_TYPES: SchemaFieldType[] = [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
];

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_\- ]*$/;

// ─── Schema ↔ fields conversion ─────────────────────────────────────────────

let fieldSeq = 0;
function makeFieldId(): string {
  fieldSeq += 1;
  return `field-${fieldSeq}`;
}

function toFieldType(raw: unknown): SchemaFieldType {
  return FIELD_TYPES.includes(raw as SchemaFieldType)
    ? (raw as SchemaFieldType)
    : "string";
}

/** Flatten a `{type:'object',properties,required}` schema into builder rows. */
export function fieldsFromJsonSchema(jsonSchema: unknown): SchemaField[] {
  if (!jsonSchema || typeof jsonSchema !== "object") return [];
  const schema = jsonSchema as Record<string, unknown>;
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((r): r is string => typeof r === "string")
    : [];
  return Object.entries(properties).map(([name, def]) => {
    const prop =
      def && typeof def === "object" ? (def as Record<string, unknown>) : {};
    return {
      id: makeFieldId(),
      name,
      type: toFieldType(prop.type),
      required: required.includes(name),
      description:
        typeof prop.description === "string" ? prop.description : "",
    };
  });
}

/** Fold builder rows into `{type:'object',properties,required}`. */
export function buildJsonSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    const prop: Record<string, unknown> = { type: field.type };
    if (field.description.trim()) prop.description = field.description.trim();
    properties[name] = prop;
    if (field.required) required.push(name);
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** Count top-level fields from a stored `json_schema.properties` object. */
export function fieldCountOf(jsonSchema: unknown): number {
  if (!jsonSchema || typeof jsonSchema !== "object") return 0;
  const properties = (jsonSchema as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object") return 0;
  return Object.keys(properties).length;
}

// ─── Built-in gallery templates ─────────────────────────────────────────────

function tpl(
  name: string,
  description: string,
  fields: Array<Omit<SchemaField, "id">>,
  sampleText: string,
): BuilderTemplate {
  return {
    name,
    description,
    fields: fields.map((f) => ({ ...f, id: makeFieldId() })),
    sampleText,
  };
}

const BUILT_IN_TEMPLATES: BuilderTemplate[] = [
  tpl(
    "Contact details",
    "Name, email, and phone number",
    [
      { name: "full_name", type: "string", required: true, description: "The person's full name" },
      { name: "email", type: "string", required: true, description: "Email address" },
      { name: "phone", type: "string", required: false, description: "Phone number, if mentioned" },
    ],
    '{\n  "full_name": "Ada Lovelace",\n  "email": "ada@example.com",\n  "phone": "+1 555-0134"\n}',
  ),
  tpl(
    "Invoice data",
    "Number, total, and line items",
    [
      { name: "invoice_number", type: "string", required: true, description: "Invoice identifier" },
      { name: "total", type: "number", required: true, description: "Grand total including tax" },
      { name: "paid", type: "boolean", required: false, description: "Whether the invoice is paid" },
      { name: "line_items", type: "array", required: false, description: "Individual line items" },
    ],
    '{\n  "invoice_number": "INV-2041",\n  "total": 1299.5,\n  "paid": false,\n  "line_items": ["Consulting (10h)", "Hosting (Q3)"]\n}',
  ),
  tpl(
    "Meeting notes",
    "Title, attendees, and decisions",
    [
      { name: "title", type: "string", required: true, description: "Meeting title or topic" },
      { name: "attendee_count", type: "integer", required: false, description: "Number of attendees" },
      { name: "decisions", type: "array", required: false, description: "Decisions made in the meeting" },
      { name: "metadata", type: "object", required: false, description: "Extra structured context" },
    ],
    '{\n  "title": "Q3 planning review",\n  "attendee_count": 6,\n  "decisions": ["Ship v2 in October"],\n  "metadata": { "room": "Ares" }\n}',
  ),
];

function serverTemplateToBuilder(t: SchemaTemplate): BuilderTemplate {
  return {
    name: t.name,
    description: t.description,
    fields: fieldsFromJsonSchema(t.json_schema),
    sampleText: t.sample_text,
  };
}

// ─── Save-error parsing (per-field) ─────────────────────────────────────────

export interface SaveErrors {
  fieldErrors: Record<string, string>;
  fieldsError: string | null;
  formError: string | null;
}

const EMPTY_SAVE_ERRORS: SaveErrors = {
  fieldErrors: {},
  fieldsError: null,
  formError: null,
};

/** Map a failed create/update into name/prompt/fields-level messages. */
function parseSaveError(err: unknown): SaveErrors {
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
    if (err.status === 409) return { ...EMPTY_SAVE_ERRORS, fieldErrors: { name: err.message } };
    return { ...EMPTY_SAVE_ERRORS, formError: err.message };
  }
  const fieldErrors: Record<string, string> = {};
  let fieldsError: string | null = null;
  let formError: string | null = null;
  for (const item of details.slice(0, 5)) {
    const loc = Array.isArray(item.loc)
      ? item.loc.filter((p): p is string => typeof p === "string")
      : [];
    const msg = typeof item.msg === "string" ? item.msg : err.message;
    const target = loc[1] ?? loc[0] ?? "";
    if (target === "name") fieldErrors.name ??= msg;
    else if (target === "prompt_template") fieldErrors.prompt_template ??= msg;
    else if (target === "json_schema") fieldsError ??= `Schema: ${msg}`;
    else formError ??= loc.length > 1 ? `${loc.slice(1).join(".")}: ${msg}` : msg;
  }
  return {
    fieldErrors,
    fieldsError,
    formError: formError ?? (fieldsError ? null : err.message),
  };
}

// ─── Local shape check (server preview unavailable) ─────────────────────────

const PRIMITIVE_CHECK: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => !!v && typeof v === "object" && !Array.isArray(v),
};

/** Validate parsed sample data against the built schema — mirrors the server
 *  preview contract (`{result, validation_errors}`) for the 404/405 path. */
function localShapeCheck(
  schema: Record<string, unknown>,
  sampleText: string,
): { result: unknown; validation_errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sampleText);
  } catch {
    throw new Error("Sample text is not valid JSON — nothing to validate.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Sample must be a JSON object matching the schema properties.");
  }
  const record = parsed as Record<string, unknown>;
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((r): r is string => typeof r === "string")
    : [];
  const validation_errors: string[] = [];
  for (const name of required) {
    if (!(name in record)) validation_errors.push(`Missing required field: ${name}`);
  }
  for (const [name, value] of Object.entries(record)) {
    const def = properties[name];
    if (!def) {
      validation_errors.push(`Unknown field: ${name} (not in schema)`);
      continue;
    }
    const check = PRIMITIVE_CHECK[String(def.type) ?? "string"];
    if (check && !check(value)) {
      validation_errors.push(`Field "${name}" should be ${String(def.type)}`);
    }
  }
  return { result: parsed, validation_errors };
}

// ─── Builder ────────────────────────────────────────────────────────────────

export interface SchemaBuilderProps {
  initialName?: string;
  initialFields?: SchemaField[];
  initialPromptTemplate?: string;
  submitLabel: string;
  onSubmit: (input: SchemaBuilderInput) => Promise<void>;
}

export function SchemaBuilder({
  initialName = "",
  initialFields = [],
  initialPromptTemplate = "",
  submitLabel,
  onSubmit,
}: SchemaBuilderProps) {
  const [name, setName] = useState(initialName);
  const [promptTemplate, setPromptTemplate] = useState(initialPromptTemplate);
  const [fields, setFields] = useState<SchemaField[]>(initialFields);
  const [saveErrors, setSaveErrors] = useState<SaveErrors>(EMPTY_SAVE_ERRORS);
  const [saving, setSaving] = useState(false);

  // Test-with-sample-text panel
  const [sampleText, setSampleText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<unknown | null>(null);
  const [testErrors, setTestErrors] = useState<string[]>([]);
  const [testError, setTestError] = useState<string | null>(null);
  const [testRan, setTestRan] = useState(false);
  const [usedLocalCheck, setUsedLocalCheck] = useState(false);

  const templatesQuery = useApiQuery(() => getTemplates());
  const serverTemplates = useMemo(
    () => (templatesQuery.data ?? []).map(serverTemplateToBuilder),
    [templatesQuery.data],
  );
  const gallery = useMemo(() => {
    const seen = new Set(BUILT_IN_TEMPLATES.map((t) => t.name));
    return [
      ...BUILT_IN_TEMPLATES,
      ...serverTemplates.filter((t) => !seen.has(t.name)),
    ];
  }, [serverTemplates]);

  const jsonSchema = useMemo(() => buildJsonSchema(fields), [fields]);
  const previewJson = useMemo(() => JSON.stringify(jsonSchema, null, 2), [jsonSchema]);
  const namedFieldCount = useMemo(
    () => fields.filter((f) => f.name.trim()).length,
    [fields],
  );

  const updateField = (id: string, patch: Partial<SchemaField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setSaveErrors((prev) => ({ ...prev, fieldsError: null }));
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const applyTemplate = (template: BuilderTemplate) => {
    // Fresh ids so React keys never collide with existing rows.
    setFields(template.fields.map((f) => ({ ...f, id: makeFieldId() })));
    setSampleText(template.sampleText);
    setTestRan(false);
    setTestResult(null);
    setTestErrors([]);
    setTestError(null);
    setSaveErrors((prev) => ({ ...prev, fieldsError: null }));
    toast.success(`Applied template "${template.name}"`);
  };

  const validateLocal = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    else if (!NAME_PATTERN.test(name.trim())) {
      errors.name = "Start with a letter; letters, numbers, spaces, _ and - only";
    }
    if (namedFieldCount === 0) errors.fields = "Add at least one field";
    const seen = new Set<string>();
    for (const f of fields) {
      const n = f.name.trim();
      if (!n) {
        errors.fields = "Every field needs a name";
        break;
      }
      if (!NAME_PATTERN.test(n)) {
        errors.fields = `Invalid field name "${n}" — start with a letter`;
        break;
      }
      const key = n.toLowerCase();
      if (seen.has(key)) {
        errors.fields = `Duplicate field name "${n}"`;
        break;
      }
      seen.add(key);
    }
    return errors;
  };

  const handleSave = async () => {
    const localErrors = validateLocal();
    if (Object.keys(localErrors).length > 0) {
      setSaveErrors({
        fieldErrors: localErrors.name ? { name: localErrors.name } : {},
        fieldsError: localErrors.fields ?? null,
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
      toast.error(parsed.formError ?? parsed.fieldsError ?? "Failed to save schema");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!sampleText.trim()) {
      setTestError("Paste sample text to run a preview.");
      setTestRan(true);
      return;
    }
    if (namedFieldCount === 0) {
      setTestError("Add at least one field before testing.");
      setTestRan(true);
      return;
    }
    setTesting(true);
    setTestError(null);
    try {
      const res = await previewSchema({ json_schema: jsonSchema, sample_text: sampleText });
      setTestResult(res.data ?? res.extracted ?? res.result ?? null);
      setTestErrors(
        (res.validation_errors ?? []).map((e) =>
          typeof e === "string"
            ? e
            : Array.isArray(e.loc) && e.loc.length
              ? `${e.loc.join(".")}: ${e.msg ?? e.message ?? "invalid"}`
              : (e.msg ?? e.message ?? "Invalid value"),
        ),
      );
      setUsedLocalCheck(false);
    } catch (err) {
      // The preview route may not exist yet on older backends (404/405) —
      // say so loudly and run an equivalent local shape check instead.
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        try {
          const local = localShapeCheck(jsonSchema, sampleText);
          setTestResult(local.result);
          setTestErrors(local.validation_errors);
          setUsedLocalCheck(true);
        } catch (localErr) {
          setTestResult(null);
          setTestErrors([]);
          setTestError(localErr instanceof Error ? localErr.message : "Local check failed");
          setUsedLocalCheck(true);
        }
      } else {
        setTestResult(null);
        setTestErrors([]);
        setTestError(err instanceof ApiError ? err.message : "Preview failed");
        setUsedLocalCheck(false);
      }
    } finally {
      setTesting(false);
      setTestRan(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Identity card ─────────────────────────────────────────────── */}
      <div className="card-base p-5 space-y-4">
        <Field
          label="Schema name"
          htmlFor="schema-name"
          required
          hint="Start with a letter; letters, numbers, spaces, _ and - only."
          error={saveErrors.fieldErrors.name}
        >
          <input
            id="schema-name"
            className="input-base"
            placeholder="e.g. invoice_data"
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
          htmlFor="schema-prompt"
          hint="Optional override — injected into the extraction prompt for this schema."
          error={saveErrors.fieldErrors.prompt_template}
        >
          <textarea
            id="schema-prompt"
            className="input-base min-h-[80px] pt-2 font-mono text-xs"
            placeholder="Extract the following fields from the text…"
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
          />
        </Field>
      </div>

      {/* ── Template gallery ──────────────────────────────────────────── */}
      <div className="card-base p-5">
        <div className="flex items-center gap-2 mb-1">
          <LayoutTemplate size={15} className="text-surface-400" />
          <h2 className="text-sm font-medium text-text-primary">Start from a template</h2>
        </div>
        <p className="text-xs text-surface-500 mb-3">
          One click fills the fields below and loads matching sample text for testing.
        </p>
        {templatesQuery.isLoading && gallery.length === 0 ? (
          <div className="flex gap-2" aria-label="Loading templates">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] w-52 shrink-0 animate-pulse rounded-lg bg-surface-800" />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" role="list">
            {gallery.map((t) => (
              <button
                key={t.name}
                type="button"
                role="listitem"
                onClick={() => applyTemplate(t)}
                className={cn(
                  "w-52 shrink-0 cursor-pointer rounded-lg border border-surface-700 bg-surface-950 p-3 text-left",
                  "transition-colors hover:border-signal-dim focus-visible:outline-2 focus-visible:outline-accent-300",
                )}
              >
                <span className="block truncate text-sm font-medium text-text-primary">{t.name}</span>
                <span className="mt-0.5 block truncate text-xs text-surface-500">{t.description}</span>
                <span className="mt-2 inline-block">
                  <Badge variant="default" size="sm">
                    {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
                  </Badge>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Builder + sticky preview ──────────────────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card-base min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-primary">
              Fields{" "}
              <span className="text-xs font-normal text-surface-500">
                ({namedFieldCount} defined)
              </span>
            </h2>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setFields((prev) => [...prev, { id: makeFieldId(), name: "", type: "string", required: false, description: "" }])}
            >
              Add field
            </Button>
          </div>

          {saveErrors.fieldsError && (
            <p className="mb-3 text-xs text-error" role="alert">{saveErrors.fieldsError}</p>
          )}

          {fields.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              title="No fields yet"
              description="Add a field above, or pick a template to prefill the schema"
            />
          ) : (
            <ul className="space-y-3">
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  className="rounded-lg border border-surface-700 bg-surface-950 p-3 space-y-3"
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                    <Field label={`Field ${index + 1} name`} htmlFor={`field-${field.id}-name`}>
                      <input
                        id={`field-${field.id}-name`}
                        className="input-base font-mono text-xs"
                        placeholder="e.g. invoice_number"
                        value={field.name}
                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Type" htmlFor={`field-${field.id}-type`}>
                      <SimpleSelect
                        id={`field-${field.id}-type`}
                        value={field.type}
                        onValueChange={(v) => updateField(field.id, { type: v as SchemaFieldType })}
                        options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
                      />
                    </Field>
                    <div className="flex items-end gap-2 pb-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`field-${field.id}-required`}
                          checked={field.required}
                          onCheckedChange={(c) => updateField(field.id, { required: c === true })}
                          aria-label={`Field ${index + 1} required`}
                        />
                        <Label htmlFor={`field-${field.id}-required`}>Required</Label>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeField(field.id)}
                        className="rounded-md text-surface-400 hover:text-error"
                        title={`Remove field ${index + 1}`}
                        aria-label={`Remove field ${index + 1}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <Field
                    label="Description"
                    htmlFor={`field-${field.id}-description`}
                    hint="Hint for the extraction model — what to pull into this field."
                  >
                    <input
                      id={`field-${field.id}-description`}
                      className="input-base text-xs"
                      placeholder="e.g. The invoice identifier printed at the top"
                      value={field.description}
                      onChange={(e) => updateField(field.id, { description: e.target.value })}
                    />
                  </Field>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          {/* Live JSON Schema preview */}
          <div className="card-base p-5">
            <h2 className="mb-1 text-sm font-medium text-text-primary">Live preview</h2>
            <p className="mb-3 text-xs text-surface-500">
              Read-only — generated from the fields on the left.
            </p>
            <pre
              className="max-h-72 overflow-auto rounded-lg bg-surface-950 p-3 font-mono text-xs text-surface-300"
              aria-label="Generated JSON Schema"
              aria-live="polite"
            >
              {previewJson}
            </pre>
          </div>

          {/* Test with sample text */}
          <div className="card-base p-5">
            <div className="mb-1 flex items-center gap-2">
              <FlaskConical size={15} className="text-surface-400" />
              <h2 className="text-sm font-medium text-text-primary">Test with sample text</h2>
            </div>
            <p className="mb-3 text-xs text-surface-500">
              Paste sample input, run a preview, and inspect the extracted JSON.
            </p>
            <label htmlFor="schema-sample" className="sr-only">Sample text</label>
            <textarea
              id="schema-sample"
              className="input-base min-h-[110px] pt-2 font-mono text-xs"
              placeholder={'{\n  "invoice_number": "INV-2041",\n  "total": 1299.5\n}'}
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
            />
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                icon={<FlaskConical size={14} />}
                loading={testing}
                onClick={handleTest}
              >
                Run preview
              </Button>
            </div>

            {testRan && (
              <div className="mt-4 space-y-3" aria-live="polite">
                {usedLocalCheck && (
                  <p className="text-xs text-surface-500">
                    Server preview unavailable — showing a local shape check instead.
                  </p>
                )}
                {testError ? (
                  <ErrorState message={testError} onRetry={handleTest} />
                ) : (
                  <>
                    <div>
                      <span className="mb-1 block text-xs font-medium text-surface-400">
                        Extracted JSON
                      </span>
                      <pre className="max-h-56 overflow-auto rounded-lg bg-surface-950 p-3 font-mono text-xs text-surface-300">
                        {testResult === null || testResult === undefined
                          ? "null"
                          : JSON.stringify(testResult, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-medium text-surface-400">
                        Validation errors
                      </span>
                      {testErrors.length === 0 ? (
                        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                          No validation errors — sample matches the schema.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {testErrors.map((e, i) => (
                            <li
                              key={i}
                              className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error"
                              role="alert"
                            >
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Save bar ──────────────────────────────────────────────────── */}
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        {saveErrors.formError ? (
          <p className="text-xs text-error" role="alert">{saveErrors.formError}</p>
        ) : (
          <p className="text-xs text-surface-500">
            {namedFieldCount} field{namedFieldCount === 1 ? "" : "s"} · saved as a structured schema
          </p>
        )}
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
