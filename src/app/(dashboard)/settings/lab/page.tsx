import { redirect } from "next/navigation";

// Exact-path bookmarks redirect to the Lab enrichment tab.
export default function LabIndexPage(): never {
  redirect("/settings/lab/enrichment");
}
