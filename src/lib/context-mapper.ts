// ─────────────────────────────────────────────────────────────────────────────
// Context → search-item mapping
//
// Mirrors the backend contract in openzync-core `schemas/context.py`
// (ContextResponse) and `services/context_formatter.py::format_json` —
// `GET /v1/projects/{id}/context?format=json` returns
// `{ context: string, metadata }` where `context` is a JSON string shaped as
// `{ episodes[], facts[], entities[], communities[] }`.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextMetadata {
  cache_hit: boolean;
  assembly_time_ms: number;
  source_counts: Record<string, unknown>;
  total_items: number;
  as_of: string | null;
}

export interface ContextResponse {
  context: string;
  metadata: ContextMetadata;
}

export interface ContextEpisodeJson {
  id?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

export interface ContextFactJson {
  id?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

export interface ContextEntityJson {
  id?: unknown;
  name?: unknown;
  summary?: unknown;
  [key: string]: unknown;
}

export interface ContextJson {
  episodes?: ContextEpisodeJson[];
  facts?: ContextFactJson[];
  entities?: ContextEntityJson[];
  communities?: ContextEntityJson[];
}

export interface SearchResultItem {
  type?: string;
  content?: string;
  score?: number;
  id?: string;
  [key: string]: unknown;
}

function toId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

/**
 * Flatten a `format=json` context payload into table-ready rows.
 *
 * Each section is mapped independently so one malformed section cannot
 * break the others. Returns `null` when the payload itself is malformed
 * (unparseable, not an object, or no usable section arrays) — callers
 * should fall back to raw rendering in that case.
 */
export function parseContextJson(context: string): SearchResultItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(context);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const data = parsed as ContextJson;
  if (
    !Array.isArray(data.episodes) &&
    !Array.isArray(data.facts) &&
    !Array.isArray(data.entities) &&
    !Array.isArray(data.communities)
  ) {
    return null;
  }

  const items: SearchResultItem[] = [];

  try {
    for (const ep of data.episodes ?? []) {
      if (typeof ep !== "object" || ep === null) continue;
      items.push({
        type: "episode",
        id: toId(ep.id),
        content: typeof ep.content === "string" ? ep.content : JSON.stringify(ep),
      });
    }
  } catch (err) {
    console.warn("context-mapper: skipping malformed episodes section", err);
  }

  try {
    for (const fact of data.facts ?? []) {
      if (typeof fact !== "object" || fact === null) continue;
      items.push({
        type: "fact",
        id: toId(fact.id),
        content: typeof fact.content === "string" ? fact.content : JSON.stringify(fact),
      });
    }
  } catch (err) {
    console.warn("context-mapper: skipping malformed facts section", err);
  }

  try {
    for (const ent of data.entities ?? []) {
      if (typeof ent !== "object" || ent === null) continue;
      const name = typeof ent.name === "string" && ent.name.trim() ? ent.name : undefined;
      const summary =
        typeof ent.summary === "string" && ent.summary.trim() ? ent.summary : undefined;
      items.push({
        type: "entity",
        id: toId(ent.id),
        content: name && summary ? `${name} — ${summary}` : (summary ?? name ?? JSON.stringify(ent)),
      });
    }
  } catch (err) {
    console.warn("context-mapper: skipping malformed entities section", err);
  }

  try {
    for (const community of data.communities ?? []) {
      if (typeof community !== "object" || community === null) continue;
      const name =
        typeof community.name === "string" && community.name.trim() ? community.name : undefined;
      const summary =
        typeof community.summary === "string" && community.summary.trim()
          ? community.summary
          : undefined;
      items.push({
        type: "entity",
        id: toId(community.id),
        content:
          name && summary ? `${name} — ${summary}` : (summary ?? name ?? JSON.stringify(community)),
      });
    }
  } catch (err) {
    console.warn("context-mapper: skipping malformed communities section", err);
  }

  return items;
}
