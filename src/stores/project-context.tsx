"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { get, ApiError } from "@/lib/api-client";

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

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ProjectProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  // The route is /projects/[id]/* so the param is named "id"
  const projectId = params?.id as string | undefined;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id — a slow response from a previous projectId (or an
  // older refetch) must never overwrite the state of a newer one.
  const requestIdRef = useRef(0);

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await get<ProjectInfo>(`/v1/projects/${projectId}`);
      if (requestId !== requestIdRef.current) return; // stale response
      setProject(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err instanceof ApiError && err.isNotFound) {
        setError("Project not found");
      } else {
        setError(
          err instanceof ApiError ? err.message : "Failed to load project",
        );
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return (
    <ProjectContext.Provider value={{ project, loading, error, refetch: fetchProject }}>
      {children}
    </ProjectContext.Provider>
  );
}
