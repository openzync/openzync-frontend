import { redirect } from "next/navigation";

// Former My Overrides overview — removed; per-tab staged resets cover resets.
// Exact-path bookmarks redirect to the first config tab.
export default function PlatformConfigIndexPage(): never {
  redirect("/settings/platform-config/llm");
}
