"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getSchema,
  updateSchema,
  type UpdateSchemaRequest,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import {
  SchemaBuilder,
  fieldsFromJsonSchema,
  type SchemaBuilderInput,
} from "@/components/schemas/schema-builder";
import {
  LabelSetBuilder,
  labelsFromJsonSchema,
} from "@/components/schemas/label-set-builder";

interface EditSchemaPageProps {
  params: Promise<{ id: string }>;
}

export default function EditSchemaPage({ params }: EditSchemaPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const schemaQuery = useApiQuery(() => getSchema(id));
  const schema = schemaQuery.data;
  const isClassification = schema?.type === "classification";

  const handleSubmit = async (input: SchemaBuilderInput) => {
    if (!schema) return;
    // Send only what changed — name uniqueness is enforced org-wide, so a
    // no-op rename must not trip the conflict check.
    const payload: UpdateSchemaRequest = {
      json_schema: input.json_schema,
      prompt_template: input.prompt_template,
    };
    if (input.name !== schema.name) payload.name = input.name;
    await updateSchema(id, payload);
    toast.success(`Schema "${input.name}" updated`);
    router.push("/settings/schemas");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={schema?.name ?? "Edit Schema"}
        description={
          isClassification
            ? "Classification label sets — edit on the left, live preview on the right"
            : "Structured schema builder — fields on the left, live preview on the right"
        }
      />

      {schemaQuery.isLoading && (
        <div className="space-y-4" aria-label="Loading schema">
          <div className="card-base h-40 animate-pulse p-5" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="card-base h-72 animate-pulse p-5" />
            <div className="card-base h-72 animate-pulse p-5" />
          </div>
        </div>
      )}

      {schemaQuery.error && !schemaQuery.isLoading && (
        <ErrorState message={schemaQuery.error} onRetry={schemaQuery.refetch} />
      )}

      {schema && isClassification && (
        <LabelSetBuilder
          key={schema.id}
          initialName={schema.name}
          initialLabels={labelsFromJsonSchema(schema.json_schema)}
          initialPromptTemplate={schema.prompt_template ?? ""}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
        />
      )}

      {schema && !isClassification && (
        <SchemaBuilder
          key={schema.id}
          initialName={schema.name}
          initialFields={fieldsFromJsonSchema(schema.json_schema)}
          initialPromptTemplate={schema.prompt_template ?? ""}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
