"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  Search,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  FileWarning,
} from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { get, uploadWithBlobs } from "@/lib/api-client";
import { toast } from "sonner";
import { BlobCard, type BlobCardData } from "@/components/shared/blob-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { EnrichmentStatus } from "@/components/shared/enrichment-status";
import { useProject } from "@/stores/project-context";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideMemory } from "@/components/guides";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface IngestResponse {
  job_id?: string;
  episode_count?: number;
  blob_count?: number;
  status?: string;
  message?: string;
}

interface ContextResult {
  context?: string;
  results?: unknown[];
  content?: string;
  [key: string]: unknown;
}

interface SearchResultItem {
  type?: string;
  content?: string;
  score?: number;
  id?: string;
  [key: string]: unknown;
}

interface SearchResponse {
  results?: SearchResultItem[];
  items?: SearchResultItem[];
  total?: number;
}

type TabId = "ingest" | "context" | "search";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "ingest", label: "Ingest", icon: <Upload size={16} /> },
  { id: "context", label: "Context", icon: <FileText size={16} /> },
  { id: "search", label: "Search", icon: <Search size={16} /> },
];

const ROLES = ["user", "assistant", "system", "tool"] as const;

// Mirrors the backend's per-blob cap (BlobStorageConfig.max_blob_size_mb,
// default 50 → 413 PayloadTooLargeError). MIME types are unrestricted
// server-side, so only size is enforced here.
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// ─── Ingest Tab ────────────────────────────────────────────────────────────────

function IngestTab({ projectId }: { projectId: string }) {
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<{ id: string; external_id: string }[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [messagesText, setMessagesText] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("user");
  const [ingesting, setIngesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TODO(me): surface per-episode enrichment bitmask once API exposes it —
  // SessionListResponse has no per-episode enrichment field today.
  useEffect(() => {
    if (!projectId) return;
    setSessionsLoading(true);
    get<{ data: { id: string; external_id: string }[] }>(
      `/v1/projects/${projectId}/sessions?limit=200&include_closed=true`
    )
      .then((res) => setSessions(res.data ?? []))
      .catch(() => { /* silent — dropdown just shows empty state */ })
      .finally(() => setSessionsLoading(false));
  }, [projectId]);

  const handleIngest = useCallback(async () => {
    if (!sessionId.trim()) { setError("Please select a session"); return; }
    if (!messagesText.trim()) { setError("Please enter at least one message"); return; }
    setIngesting(true); setUploading(true); setError(null); setResult(null);

    const lines = messagesText.trim().split("\n").filter(Boolean);
    const messages = lines.map((line) => {
      const match = line.match(/^(user|assistant|system|tool):\s*(.*)/i);
      return match ? { role: match[1].toLowerCase(), content: match[2] } : { role: selectedRole, content: line };
    });

    try {
      const body: Record<string, unknown> = { messages, session_id: sessionId.trim() };

      // Endpoint only accepts multipart/form-data (even for text-only calls) —
      // uploadWithBlobs appends `data` = JSON.stringify(payload) + blobs.
      const data = await uploadWithBlobs<IngestResponse>(
        `/v1/projects/${projectId}/memory`,
        body,
        selectedFiles,
      );

      setResult(data);
      setSelectedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally { setIngesting(false); setUploading(false); }
  }, [projectId, messagesText, selectedRole, sessionId, selectedFiles]);

  return (
    <div className="card-base p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Upload size={16} className="text-brand-300" />Ingest Messages</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Session" htmlFor="memory-session-select" required>
          <select id="memory-session-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="input-base" required>
            <option value="">Select a session...</option>
            {sessionsLoading && <option disabled>Loading sessions...</option>}
            {!sessionsLoading && sessions.length === 0 && <option disabled>No sessions found</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.external_id || s.id.slice(0, 8)}</option>
            ))}
          </select>
        </Field>
      </div>
      {!sessionId && !sessionsLoading && (
        <p className="text-xs text-warning -mt-3">Select a session — memory is ingested into an existing session only.</p>
      )}
      <Field label="Messages" htmlFor="memory-messages" hint="One per line, format: role: content">
        <textarea id="memory-messages" value={messagesText} onChange={(e) => setMessagesText(e.target.value)}
          placeholder="user: What is the capital of France?&#10;assistant: The capital of France is Paris."
          rows={6} className="input-base min-h-[120px] py-2 resize-y leading-relaxed" style={{ height: "auto" }} />
      </Field>
      {/* ── File Attachments ───────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-surface-300">
          Attachments <span className="text-surface-500">(optional)</span>
        </label>

        {/* Drop zone */}
        <label
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
            "border-surface-600 bg-surface-800/30 p-6 cursor-pointer",
            "hover:border-brand-500/50 hover:bg-surface-800/50 transition-colors",
          )}
        >
          <Upload className="size-8 text-surface-400" />
          <p className="text-sm text-surface-400">
            <span className="text-brand-400 font-medium">Click to upload</span>{" "}
            or drag and drop
          </p>
          <p className="text-xs text-surface-500">
            Images, PDFs, documents — up to 50 MB each
          </p>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              const accepted: File[] = [];
              for (const file of files) {
                if (file.size > MAX_FILE_BYTES) {
                  toast.error(`${file.name}: exceeds the 50 MB per-file limit`);
                } else {
                  accepted.push(file);
                }
              }
              setSelectedFiles((prev) => [...prev, ...accepted]);
              // Reset so re-selecting the same file works
              e.target.value = "";
            }}
          />
        </label>

        {/* File list */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-2 max-w-[240px] group"
              >
                <FileWarning className="size-5 shrink-0 text-surface-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-200 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-surface-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="shrink-0 p-0.5 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end gap-4">
        <Field label="Default Role" htmlFor="memory-default-role">
          <SimpleSelect
            id="memory-default-role"
            options={ROLES.map((role) => ({ value: role, label: role }))}
            value={selectedRole}
            onValueChange={setSelectedRole}
            className="w-36"
          />
        </Field>
        <Button variant="primary" onClick={handleIngest} loading={ingesting} disabled={!sessionId.trim()} icon={<Upload size={16} />}>Ingest</Button>
      </div>
      {error && (<div className="flex items-start gap-2 rounded-md bg-error/10 border border-error/30 p-3 text-sm text-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>)}
      {result && (
        <div className="space-y-3 rounded-md bg-brand-500/5 border border-brand-500/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-300"><CheckCircle2 size={16} />Ingest Successful</div>
          <EnrichmentStatus
            jobId={result.job_id}
            status={result.status}
            episodeCount={result.episode_count}
            blobCount={result.blob_count}
          />
        </div>
      )}
    </div>
  );
}

// ─── Context Tab ───────────────────────────────────────────────────────────────

function ContextTab({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(10);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<ContextResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGetContext = useCallback(async () => {
    if (!query.trim()) { setError("Please enter a query"); return; }
    setFetching(true); setError(null); setResult(null);
    try {
      const encodedQuery = encodeURIComponent(query.trim());
      const data = await get<ContextResult>(`/v1/projects/${projectId}/context?query=${encodedQuery}&limit=${limit}`);
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to fetch context"); }
    finally { setFetching(false); }
  }, [projectId, query, limit]);

  return (
    <div className="card-base p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2"><FileText size={16} className="text-brand-300" />Query Context</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-surface-400">
            <div className="flex items-center justify-between"><span>Limit</span><span className="text-surface-500 font-mono text-[11px]">{limit}</span></div>
          </label>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value))}
              className="flex-1 accent-brand-500 h-1.5 cursor-pointer"
              style={{ appearance: "none", height: "6px", borderRadius: "3px", background: `linear-gradient(to right, #14488C ${limit}%, #303A4E ${limit}%)` }} />
            <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="input-base w-16 text-center text-sm" />
          </div>
        </div>
      </div>
      <Field label="Query" htmlFor="context-query">
        <input id="context-query" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. What did the user say about their project?"
          className="input-base" onKeyDown={(e) => { if (e.key === "Enter" && !fetching) handleGetContext(); }} />
      </Field>
      <Button variant="primary" onClick={handleGetContext} loading={fetching} disabled={!query.trim()} icon={<FileText size={16} />}>Get Context</Button>
      {error && (<div className="flex items-start gap-2 rounded-md bg-error/10 border border-error/30 p-3 text-sm text-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>)}
      {result && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Context Results</h3>
          <pre className="rounded-md bg-surface-950 border border-surface-800 p-4 text-sm text-surface-200 font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Search Tab ────────────────────────────────────────────────────────────────

function SearchTab({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [searchEpisodes, setSearchEpisodes] = useState(true);
  const [searchFacts, setSearchFacts] = useState(true);
  const [searchEntities, setSearchEntities] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) { setError("Please enter a query"); return; }
    setSearching(true); setError(null); setResults(null);
    try {
      const selectedTypes: string[] = [];
      if (searchEpisodes) selectedTypes.push("episodes");
      if (searchFacts) selectedTypes.push("facts");
      if (searchEntities) selectedTypes.push("entities");
      const params = new URLSearchParams();
      params.set("query", query.trim());
      if (selectedTypes.length > 0 && selectedTypes.length < 3) params.set("type", selectedTypes.join(","));
      const data = await get<SearchResponse>(`/v1/projects/${projectId}/search?${params.toString()}`);
      setResults(Array.isArray(data.results ?? data.items) ? (data.results ?? data.items ?? []) : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Search failed"); }
    finally { setSearching(false); }
  }, [projectId, query, searchEpisodes, searchFacts, searchEntities]);

  return (
    <div className="card-base p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Search size={16} className="text-brand-300" />Search Memory</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-surface-400">Type Filter</label>
          <div className="flex flex-wrap gap-3 h-9 items-center">
            {[
              { id: "episodes" as const, label: "Episodes", value: searchEpisodes, set: setSearchEpisodes },
              { id: "facts" as const, label: "Facts", value: searchFacts, set: setSearchFacts },
              { id: "entities" as const, label: "Entities", value: searchEntities, set: setSearchEntities },
            ].map(({ id, label, value, set }) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer text-sm text-surface-300 hover:text-surface-100 transition-colors">
                <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)}
                  className="rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500/30 focus:ring-offset-0" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <Field label="Query" htmlFor="memory-search-query">
        <input id="memory-search-query" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search across episodes, facts, and entities..."
          className="input-base" onKeyDown={(e) => { if (e.key === "Enter" && !searching) handleSearch(); }} />
      </Field>
      <Button variant="primary" onClick={handleSearch} loading={searching} disabled={!query.trim()} icon={<Search size={16} />}>Search</Button>
      {error && (<div className="flex items-start gap-2 rounded-md bg-error/10 border border-error/30 p-3 text-sm text-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>)}
      {results !== null && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Results <span className="text-surface-500 font-normal normal-case">({results.length})</span></h3>
          {results.length === 0 ? (
            <div className="rounded-md bg-surface-950 border border-surface-800 p-6 text-center text-sm text-surface-500">No results found for this query.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-surface-800">
              {/* note: canonical table style — was a denser px-3 variant, normalized for consistency */}
              <Table zebra={false}>
                <TableHeader>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead align="right" className="w-20">Score</TableHead>
                </TableHeader>
                <TableBody>
                  {results.map((item, i) => (
                    <TableRow key={item.id ?? i}>
                      <TableCell>
                        <Badge variant={
                          item.type === "episode" || item.type === "episodes" ? "info"
                          : item.type === "fact" || item.type === "facts" ? "success"
                          : item.type === "entity" || item.type === "entities" ? "warning"
                          : "default"
                        } size="sm">{item.type ?? "unknown"}</Badge>
                      </TableCell>
                      <TableCell className="text-surface-200 max-w-md truncate">{item.content ?? JSON.stringify(item)}</TableCell>
                      <TableCell align="right">
                        {item.score !== undefined ? (
                          <span className={cn("font-mono text-xs font-medium",
                            item.score >= 0.7 ? "text-success" : item.score >= 0.4 ? "text-warning" : "text-surface-400"
                          )}>{(item.score * 100).toFixed(0)}%</span>
                        ) : <span className="text-surface-600">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <MemoryPageInner />
    </Suspense>
  );
}

function MemoryPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { project } = useProject();
  const projectId = project?.id;

  // Tab lives in the URL (?tab=ingest|context|search) so deep links and
  // back/forward work. Unknown values clamp to the default.
  const rawTab = searchParams.get("tab") ?? "ingest";
  const activeTab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "ingest";

  function setTab(tab: string) {
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  }

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Memory" description="Ingest messages, query context, and search across memory" />
        <div className="card-base p-8 flex flex-col items-center justify-center text-surface-500">
          <AlertCircle size={24} className="mb-2" />
          <p className="text-sm">Select a project to access memory features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Memory" description={`Ingest messages, query context, and search across memory${project ? ` · ${project.name}` : ""}`} />

      <PageGuide title="Knowledge memory" illustration={<GuideMemory />}>
        <p>Memory stores accumulated knowledge across all sessions — entities, facts, and relationships extracted from conversations. This persistent knowledge graph enables your AI to recall context from past interactions.</p>
      </PageGuide>

      <Tabs variant="pill" value={activeTab} onValueChange={setTab} className="w-fit">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.icon}{tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeTab === "ingest" && <IngestTab projectId={projectId} />}
      {activeTab === "context" && <ContextTab projectId={projectId} />}
      {activeTab === "search" && <SearchTab projectId={projectId} />}
    </div>
  );
}
