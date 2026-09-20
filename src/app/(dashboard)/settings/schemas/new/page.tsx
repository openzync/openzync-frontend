"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileJson, Tags } from "lucide-react";
import { toast } from "sonner";
import { createSchema } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import {
  SchemaBuilder,
  type SchemaBuilderInput,
} from "@/components/schemas/schema-builder";
import { LabelSetBuilder } from "@/components/schemas/label-set-builder";
import { cn } from "@/lib/utils";

type SchemaTypeChoice = "structured" | "classification";

function initialChoice(param: string | null): SchemaTypeChoice {
  return param === "classification" ? "classification" : "structured";
}

function NewSchemaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [schemaType, setSchemaType] = useState<SchemaTypeChoice>(() =>
    initialChoice(searchParams.get("type")),
  );

  const handleSubmitStructured = async (input: SchemaBuilderInput) => {
    await createSchema({
      name: input.name,
      json_schema: input.json_schema,
      type: "structured",
      prompt_template: input.prompt_template,
    });
    toast.success(`Schema "${input.name}" created`);
    router.push("/settings/schemas");
  };

  const handleSubmitClassification = async (input: SchemaBuilderInput) => {
    await createSchema({
      name: input.name,
      json_schema: input.json_schema,
      type: "classification",
      prompt_template: input.prompt_template,
    });
    toast.success(`Schema "${input.name}" created`);
    router.push("/settings/schemas");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Schema"
        description={
          schemaType === "classification"
            ? "Define label sets on the left — the classification schema builds itself on the right"
            : "Define fields on the left — the JSON Schema builds itself on the right"
        }
      />

      {/* ── Type picker ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Schema type">
        <button
          type="button"
          role="radio"
          aria-checked={schemaType === "structured"}
          onClick={() => setSchemaType("structured")}
          className={cn(
            "cursor-pointer rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent-300",
            schemaType === "structured"
              ? "border-signal-dim bg-surface-900"
              : "border-surface-700 bg-surface-950 hover:border-surface-500",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <FileJson size={15} className="text-surface-400" />
            Structured
          </span>
          <span className="mt-1 block text-xs text-surface-500">
            Extract data fields — build a JSON Schema with typed fields.
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={schemaType === "classification"}
          onClick={() => setSchemaType("classification")}
          className={cn(
            "cursor-pointer rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent-300",
            schemaType === "classification"
              ? "border-signal-dim bg-surface-900"
              : "border-surface-700 bg-surface-950 hover:border-surface-500",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Tags size={15} className="text-surface-400" />
            Classification
          </span>
          <span className="mt-1 block text-xs text-surface-500">
            Label sets for dialog classification — intent, emotion, valence, arousal.
          </span>
        </button>
      </div>

      {schemaType === "structured" ? (
        <SchemaBuilder submitLabel="Create Schema" onSubmit={handleSubmitStructured} />
      ) : (
        <LabelSetBuilder submitLabel="Create Schema" onSubmit={handleSubmitClassification} />
      )}
    </div>
  );
}

export default function NewSchemaPage() {
  return (
    <Suspense
      fallback={<div className="card-base h-40 animate-pulse p-5" aria-label="Loading" />}
    >
      <NewSchemaContent />
    </Suspense>
  );
}
