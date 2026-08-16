import { describe, it, expect } from "vitest";
import poEnRaw from "@/messages/en.po?raw";
import poHiRaw from "@/messages/hi.po?raw";
import poParser from "po-parser";

/** A single catalog entry: full dotted key + string value. */
type Entry = { id: string; message: string };

/** Parse raw PO text into flat id → message entries (msgctxt.msgid = id,
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

/** Extract the ICU placeholder signatures from a message value: each
 *  top-level `{…}` expression is kept as its selector structure with any
 *  nested plural-branch content stripped (branch text is legitimately
 *  translated — the selector syntax and variable names must match). */
function icuSignatures(value: string): Set<string> {
  const out = new Set<string>();
  let depth = 0;
  let start = -1;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const expr = value.slice(start, i + 1);
        // Strip nested {…} branch content (one level deep in ICU plurals).
        const sig = expr.replace(/\s*\{[^{}]*\}\s*/g, " ").replace(/\s+/g, " ");
        out.add(sig);
        start = -1;
      }
    }
  }
  return out;
}

const enEntries = parseCatalog(poEnRaw);
const hiEntries = parseCatalog(poHiRaw);

const enById = new Map(enEntries.map((e) => [e.id, e]));
const hiById = new Map(hiEntries.map((e) => [e.id, e]));
const enIds = [...enById.keys()];
const hiIds = [...hiById.keys()];

describe("hi.po parity with en.po", () => {
  it("has the same entry count as en.po (1595 — no missing/superfluous)", () => {
    expect(enEntries.length).toBe(1595);
    expect(hiEntries.length).toBe(enEntries.length);
  });

  it("has exactly the same key set — no missing or superfluous keys", () => {
    const missing = enIds.filter((k) => !hiById.has(k));
    const superfluous = hiIds.filter((k) => !enById.has(k));
    expect(missing, `missing keys: ${missing.join(", ")}`).toEqual([]);
    expect(superfluous, `superfluous keys: ${superfluous.join(", ")}`).toEqual([]);
  });

  it("has a non-empty Hindi msgstr for every key", () => {
    for (const id of enIds) {
      const hi = hiById.get(id)!.message;
      expect(hi.length, `${id} (empty Hindi msgstr)`).toBeGreaterThan(0);
    }
  });

  it("keeps the ICU placeholder set byte-identical per entry", () => {
    for (const id of enIds) {
      const enPlaceholders = icuSignatures(enById.get(id)!.message);
      const hiPlaceholders = icuSignatures(hiById.get(id)!.message);
      expect([...hiPlaceholders].sort(), `${id} (ICU placeholder mismatch)`).toEqual(
        [...enPlaceholders].sort(),
      );
    }
  });
});
