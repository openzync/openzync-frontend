"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSchema } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import {
  SchemaBuilder,
  type SchemaBuilderInput,
} from "@/components/schemas/schema-builder";

export default function NewSchemaPage() {
  const router = useRouter();

  const handleSubmit = async (input: SchemaBuilderInput) => {
    // Structured-only: the builder never offers a type selector.
    await createSchema({
      name: input.name,
      json_schema: input.json_schema,
      type: "structured",
      prompt_template: input.prompt_template,
    });
    toast.success(`Schema "${input.name}" created`);
    router.push("/settings/schemas");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Schema"
        description="Define fields on the left — the JSON Schema builds itself on the right"
      />
      <SchemaBuilder submitLabel="Create Schema" onSubmit={handleSubmit} />
    </div>
  );
}
