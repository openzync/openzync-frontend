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

interface EditSchemaPageProps {
  params: Promise<{ id: string }>;
}

export default function EditSchemaPage({ params }: EditSchemaPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const schemaQuery = useApiQuery(() => getSchema(id));
  const schema = schemaQuery.data;

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
        description="Structured schema builder — fields on the left, live preview on the right"
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

      {schema && schema.type !== "structured" && (
        <ErrorState
          message={`"${schema.name}" is a ${schema.type} schema — only structured schemas can be edited in this builder.`}
          onRetry={() => router.push("/settings/schemas")}
        />
      )}

      {schema && schema.type === "structured" && (
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
