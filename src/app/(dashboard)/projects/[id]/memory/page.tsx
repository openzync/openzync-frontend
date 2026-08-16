"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import { BlobCard, type BlobCardData } from "@/components/shared/blob-card";
import { EnrichmentStatus } from "@/components/shared/enrichment-status";
import { useProject } from "@/stores/project-context";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideMemory } from "@/components/guides";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

const ROLES = ["user", "assistant", "system", "tool"] as const;

// ─── Ingest Tab ────────────────────────────────────────────────────────────────

function IngestTab({ projectId, t }: { projectId: string; t: (key: string, values?: Record<string, string | number | Date>) => string }) {
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
    if (!sessionId.trim()) { setError(t("ingest.selectSessionError")); return; }
    if (!messagesText.trim()) { setError(t("ingest.messagesError")); return; }
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
      setError(err instanceof Error ? err.message : t("ingest.failed"));
    } finally { setIngesting(false); setUploading(false); }
  }, [projectId, messagesText, selectedRole, sessionId, selectedFiles, t]);

  return (
    <div className="card-base p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Upload size={16} className="text-brand-300" />{t("ingest.title")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="memory-session-select" className="text-xs font-medium text-surface-400">{t("ingest.sessionLabel")} <span className="text-surface-500 font-normal">({t("ingest.required")})</span></label>
          <select id="memory-session-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="input-base" required>
            <option value="">{t("ingest.selectSession")}</option>
            {sessionsLoading && <option disabled>{t("ingest.loadingSessions")}</option>}
            {!sessionsLoading && sessions.length === 0 && <option disabled>{t("ingest.noSessions")}</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.external_id || s.id.slice(0, 8)}</option>
            ))}
          </select>
          {!sessionId && !sessionsLoading && (
            <p className="text-xs text-warning">{t("ingest.sessionHint")}</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-surface-400">{t("ingest.messagesLabel")} <span className="text-surface-500 font-normal">({t("ingest.messagesFormatHint")})</span></label>
        <textarea value={messagesText} onChange={(e) => setMessagesText(e.target.value)}
          placeholder={t("ingest.messagesPlaceholder")}
          rows={6} className="input-base min-h-[120px] py-2 resize-y leading-relaxed" style={{ height: "auto" }} />
      </div>
      {/* ── File Attachments ───────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-surface-300">
          {t("ingest.attachments")} <span className="text-surface-500">({t("ingest.optional")})</span>
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
            <span className="text-brand-400 font-medium">{t("ingest.clickToUpload")}</span>{" "}
            {t("ingest.orDragDrop")}
          </p>
          <p className="text-xs text-surface-500">
            {t("ingest.fileTypesHint")}
          </p>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setSelectedFiles((prev) => [...prev, ...files]);
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
                  aria-label={t("ingest.removeFile")}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-surface-400">{t("ingest.defaultRole")}</label>
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}
            className="input-base cursor-pointer w-36 appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A99AB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: "32px",
            }}
          >
            {ROLES.map((role) => (<option key={role} value={role}>{role}</option>))}
          </select>
        </div>
        <Button variant="primary" onClick={handleIngest} loading={ingesting} disabled={!sessionId.trim()} icon={<Upload size={16} />}>{t("ingest.submit")}</Button>
      </div>
      {error && (<div className="flex items-start gap-2 rounded-md bg-error/10 border border-error/30 p-3 text-sm text-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>)}
      {result && (
        <div className="space-y-3 rounded-md bg-brand-500/5 border border-brand-500/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-300"><CheckCircle2 size={16} />{t("ingest.success")}</div>
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

function ContextTab({ projectId, t }: { projectId: string; t: (key: string, values?: Record<string, string | number | Date>) => string }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(10);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<ContextResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGetContext = useCallback(async () => {
    if (!query.trim()) { setError(t("context.queryError")); return; }
    setFetching(true); setError(null); setResult(null);
    try {
      const encodedQuery = encodeURIComponent(query.trim());
      const data = await get<ContextResult>(`/v1/projects/${projectId}/context?query=${encodedQuery}&limit=${limit}`);
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : t("context.fetchFailed")); }
    finally { setFetching(false); }
  }, [projectId, query, limit, t]);

  return (
    <div className="card-base p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2"><FileText size={16} className="text-brand-300" />{t("context.title")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-surface-400">
            <div className="flex items-center justify-between"><span>{t("context.limit")}</span><span className="text-surface-500 font-mono text-[11px]">{limit}</span></div>
          </label>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value))}
              className="flex-1 accent-brand-500 h-1.5 cursor-pointer"
              style={{ appearance: "none", height: "6px", borderRadius: "3px", background: `linear-gradient(to right, #14488C ${limit}%, #303A4E ${limit}%)` }} />
            <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="input-base w-16 text-center text-sm" />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-surface-400">{t("context.queryLabel")}</label>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("context.queryPlaceholder")}
          className="input-base" onKeyDown={(e) => { if (e.key === "Enter" && !fetching) handleGetContext(); }} />
      </div>
      <Button variant="primary" onClick={handleGetContext} loading={fetching} disabled={!query.trim()} icon={<FileText size={16} />}>{t("context.submit")}</Button>
      {error && (<div className="flex items-start gap-2 rounded-md bg-error/10 border border-error/30 p-3 text-sm text-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>)}
      {result && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{t("context.results")}</h3>
          <pre className="rounded-md bg-surface-950 border border-surface-800 p-4 text-sm text-surface-200 font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Search Tab ────────────────────────────────────────────────────────────────

function SearchTab({ projectId, t }: { projectId: string; t: (key: string, values?: Record<string, string | number | Date>) => string }) {
  const [query, setQuery] = useState("");
  const [searchEpisodes, setSearchEpisodes] = useState(true);
  const [searchFacts, setSearchFacts] = useState(true);
  const [searchEntities, setSearchEntities] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) { setError(t("search.queryError")); return; }
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
    } catch (err) { setError(err instanceof Error ? err.message : t("search.failed")); }
    finally { setSearching(false); }
  }, [projectId, query, searchEpisodes, searchFacts, searchEntities, t]);

  return (
    <div className="card-base p-5 space-y-5">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Search size={16} className="text-brand-300" />{t("search.title")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-surface-400">{t("search.typeFilter")}</label>
          <div className="flex flex-wrap gap-3 h-9 items-center">
            {[
              { id: "episodes" as const, label: t("search.types.episodes"), value: searchEpisodes, set: setSearchEpisodes },
              { id: "facts" as const, label: t("search.types.facts"), value: searchFacts, set: setSearchFacts },
              { id: "entities" as const, label: t("search.types.entities"), value: searchEntities, set: setSearchEntities },
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
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-surface-400">{t("search.queryLabel")}</label>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search.queryPlaceholder")}
          className="input-base" onKeyDown={(e) => { if (e.key === "Enter" && !searching) handleSearch(); }} />
      </div>
      <Button variant="primary" onClick={handleSearch} loading={searching} disabled={!query.trim()} icon={<Search size={16} />}>{t("search.submit")}</Button>
      {error && (<div className="flex items-start gap-2 rounded-md bg-error/10 border border-error/30 p-3 text-sm text-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>)}
      {results !== null && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{t("search.results", { count: results.length })}</h3>
          {results.length === 0 ? (
            <div className="rounded-md bg-surface-950 border border-surface-800 p-6 text-center text-sm text-surface-500">{t("search.noResults")}</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-surface-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-950 border-b border-surface-800">
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-400 uppercase tracking-wider w-24">{t("search.table.type")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-400 uppercase tracking-wider">{t("search.table.content")}</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-surface-400 uppercase tracking-wider w-20">{t("search.table.score")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {results.map((item, i) => (
                    <tr key={item.id ?? i} className="hover:bg-surface-800/50 transition-colors">
                      <td className="px-3 py-2.5">
                        <Badge variant={
                          item.type === "episode" || item.type === "episodes" ? "info"
                          : item.type === "fact" || item.type === "facts" ? "success"
                          : item.type === "entity" || item.type === "entities" ? "warning"
                          : "default"
                        } size="sm">{item.type ?? t("search.unknown")}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-surface-200 max-w-md truncate">{item.content ?? JSON.stringify(item)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {item.score !== undefined ? (
                          <span className={cn("font-mono text-xs font-medium",
                            item.score >= 0.7 ? "text-success" : item.score >= 0.4 ? "text-warning" : "text-surface-400"
                          )}>{(item.score * 100).toFixed(0)}%</span>
                        ) : <span className="text-surface-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const t = useTranslations("memory");
  const [activeTab, setActiveTab] = useState<TabId>("ingest");
  const { project } = useProject();
  const projectId = project?.id;

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "ingest", label: t("tabs.ingest"), icon: <Upload size={16} /> },
    { id: "context", label: t("tabs.context"), icon: <FileText size={16} /> },
    { id: "search", label: t("tabs.search"), icon: <Search size={16} /> },
  ];

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="card-base p-8 flex flex-col items-center justify-center text-surface-500">
          <AlertCircle size={24} className="mb-2" />
          <p className="text-sm">{t("noProject")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={project ? t("descriptionWithProject", { name: project.name }) : t("description")} />

      <PageGuide title={t("guideTitle")} illustration={<GuideMemory />}>
        <p>{t("guideBody")}</p>
      </PageGuide>

      <div className="flex gap-1 rounded-lg bg-surface-950 p-1 border border-surface-800 w-fit">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn("flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.id ? "bg-brand-500 text-white shadow-sm" : "bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-surface-100"
            )}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "ingest" && <IngestTab projectId={projectId} t={t} />}
      {activeTab === "context" && <ContextTab projectId={projectId} t={t} />}
      {activeTab === "search" && <SearchTab projectId={projectId} t={t} />}
    </div>
  );
}
