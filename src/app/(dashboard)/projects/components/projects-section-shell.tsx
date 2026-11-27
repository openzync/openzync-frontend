"use client";

import { GuideData, PageGuide } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";

interface ProjectsSectionShellProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  guideTitle?: string;
  guideBody?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared section shell for /projects and /invitations — PageHeader +
 * PageGuide + content. The pages stay separate standalone routes; this
 * shares only the header/guide design (no tab bar).
 */
export function ProjectsSectionShell({
  title = "Projects",
  description = "Collaborative workspaces for memory and knowledge graph data",
  actions,
  guideTitle = "Projects and invitations",
  guideBody = (
    <p>
      Projects are collaborative workspaces for sessions, memory, and
      knowledge graphs. Invitations list workspaces waiting for you to
      approve or decline.
    </p>
  ),
  children,
}: ProjectsSectionShellProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={actions}
      />

      <PageGuide title={guideTitle} illustration={<GuideData />}>
        {guideBody}
      </PageGuide>

      {children}
    </div>
  );
}
