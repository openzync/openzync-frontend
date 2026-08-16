import { describe, it, expect } from "vitest";
import poRaw from "@/messages/en.po?raw";
import poParser from "po-parser";
import { locales, defaultLocale } from "@/i18n/config";

/** A single catalog entry: full dotted key + string value. */
type Entry = { id: string; message: string };

/** Parse the raw PO text into flat id → message entries (msgctxt.msgid = id,
 *  msgstr = value — the next-intl/eloqnt PO convention). */
function parseCatalog(raw: string): Entry[] {
  const catalog = poParser.parse(raw);
  const entries: Entry[] = [];
  for (const msg of catalog.messages ?? []) {
    if (!msg.msgid) continue; // header entry
    const id = msg.msgctxt ? `${msg.msgctxt}.${msg.msgid}` : msg.msgid;
    entries.push({ id, message: msg.msgstr });
  }
  return entries;
}

/** The 16 namespaces the dashboard shell and pages consume. */
const KNOWN_NAMESPACES = [
  "common",
  "nav",
  "errors",
  "auth",
  "overview",
  "projects",
  "sessions",
  "settings",
  "users",
  "audit",
  "monitoring",
  "graph",
  "components",
  "superadmin",
  "invite",
  "memory",
];

/** Lowercase-start, alnum (camelCase or kebab) dot-separated key paths. */
const KEY_PATH_RE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/;

/** Match anything that looks like an HTML/JSX tag (<b>, </p>, <a href=…). */
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;

/**
 * Flag only DANGEROUS HTML. The catalog deliberately carries next-intl rich
 * text (`<strong>{param}</strong>`) which renders as styled text — that is
 * the intended escape hatch, not raw HTML injection. Script/event-handler/
 * javascript: URLs are never acceptable in message values.
 */
const DANGEROUS_HTML_RE = /<script|<\s*\w+[^>]*\son\w+\s*=|href\s*=\s*["']\s*javascript:/i;

/** Crude ICU brace-balance check — eloqnt lint does the real validation. */
function icuBracesBalanced(value: string): boolean {
  let depth = 0;
  for (const ch of value) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

const entries = parseCatalog(poRaw);
const ids = entries.map((e) => e.id);

describe("message catalog (en.po)", () => {
  it("parses as PO with the full pre-migration key count (1595 — losslessness pin)", () => {
    expect(entries.length).toBe(1595);
    expect(poRaw.trim().length).toBeGreaterThan(0);
  });

  it("top-level namespaces match the known set exactly", () => {
    const actual = [...new Set(ids.map((id) => id.split(".")[0]!))].sort();
    const expected = [...KNOWN_NAMESPACES].sort();
    expect(actual).toEqual(expected);
  });

  it("every key path is dot-separated lowercase-alnum segments — no source-language keys", () => {
    // Rejects: spaces ("Hello world"), leading uppercase ("Overview"),
    // underscores, dashes, or any non-alnum segment.
    expect(ids.filter((k) => !KEY_PATH_RE.test(k))).toEqual([]);
  });

  it("contains no dangerous HTML in any message value", () => {
    for (const { id, message } of entries) {
      expect(DANGEROUS_HTML_RE.test(message), id).toBe(false);
      // Rich-text tags are allowed, but every open tag must be closed
      // (balanced) so the tree never renders stray markup.
      if (HTML_TAG_RE.test(message)) {
        const opens = message.match(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g) ?? [];
        const closes = message.match(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g) ?? [];
        expect(opens.length, `${id} (unclosed tag)`).toBe(closes.length);
      }
    }
  });

  it("config is coherent — default locale is a supported locale", () => {
    expect(locales).toContain(defaultLocale);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("has no leftover placeholder keys and every msgstr is a non-empty string", () => {
    for (const { id, message } of entries) {
      expect(id).not.toContain("__pending__");
      expect(message.length, `${id} (empty msgstr)`).toBeGreaterThan(0);
    }
  });

  it("has balanced ICU braces in every message value", () => {
    for (const { id, message } of entries) {
      expect(icuBracesBalanced(message), id).toBe(true);
    }
  });

  it("uses key-based ids — no message value equals its key path", () => {
    const byId = new Map(entries.map((e) => [e.id, e.message]));
    for (const { id, message } of entries) {
      expect(byId.get(id), id).toBe(message);
      expect(message, id).not.toBe(id);
    }
  });
});
