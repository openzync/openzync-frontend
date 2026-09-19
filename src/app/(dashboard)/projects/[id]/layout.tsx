"use client";

// ProjectProvider lives at the root layout (single source for
// GET /v1/projects/:id) — this segment is a passthrough.
export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
