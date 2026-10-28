"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { get, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  is_archived: boolean;
  member_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProjectContextValue {
  project: ProjectInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}

/**
 * Null-safe read for layouts mounted above the ProjectProvider
 * (e.g. the dashboard shell) — returns null outside project routes
 * instead of throwing.
 */
export function useProjectOptional(): ProjectContextValue | null {
  return useContext(ProjectContext) ?? null;
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ProjectProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  // The route is /projects/[id]/* so the param is named "id"
  const projectId = params?.id as string | undefined;

  // Single fetch path for the whole project subtree — race-safe and
  // unmount-safe via the hook's run-id guard (no hand-rolled request ids).
  // Palette components keep their own AbortController: fetch aborts on
  // unmount there are intentional UX cancellations, not dedup races.
  const query = useApiQuery<ProjectInfo>(
    async (signal) => {
      try {
        return await get<ProjectInfo>(
          `/v1/projects/${encodeURIComponent(projectId ?? "")}`,
          { signal },
        );
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          throw new Error("Project not found");
        }
        // ApiError messages are already user-safe (parsed server text) —
        // pass through. Anything else is a transport failure with no safe
        // text, so use the stable generic string.
        if (err instanceof ApiError) throw err;
        throw new Error("Failed to load project");
      }
    },
    { enabled: Boolean(projectId), refreshKey: projectId },
  );

  return (
    <ProjectContext.Provider
      value={{
        project: query.data,
        loading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
