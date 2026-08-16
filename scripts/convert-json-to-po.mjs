// ═══════════════════════════════════════════════════════════════════════════════
// One-off migration: src/messages/en.json → src/messages/en.po
//
// Lossless JSON→PO conversion for the next-intl catalog. PO entries use the
// next-intl/eloqnt convention: msgctxt = namespace (all but the last key
// segment), msgid = leaf key, msgstr = English value. ICU syntax is preserved
// byte-for-byte in msgstr (po-parser only escapes quotes/backslashes on write).
//
// Run: node scripts/convert-json-to-po.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import poParser from "po-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src/messages/en.json");
const OUT = path.join(ROOT, "src/messages/en.po");

/** #. descriptions for keys where the key path alone doesn't convey the
 *  user-facing context a translator needs. Everything else stays key-based. */
const DESCRIPTIONS = {
  "common.metadata.title": "Document <title> shown in the browser tab.",
  "common.metadata.description": "Meta description for SEO and social sharing.",
  "common.timeAgo.now": "Relative timestamp label: less than a minute ago.",
  "common.timeAgo.seconds": "Relative timestamp: {count} is seconds.",
  "common.timeAgo.minutes": "Relative timestamp: {count} is minutes.",
  "common.timeAgo.hours": "Relative timestamp: {count} is hours.",
  "common.timeAgo.days": "Relative timestamp: {count} is days.",
  "errors.http400": "Shown to users when an API request fails with HTTP 400.",
  "errors.http401": "Shown to users when an API request fails with HTTP 401.",
  "errors.http403": "Shown to users when an API request fails with HTTP 403.",
  "errors.http404": "Shown to users when an API request fails with HTTP 404.",
  "errors.http409": "Shown to users when an API request fails with HTTP 409.",
  "errors.http413": "Shown to users when an API request fails with HTTP 413.",
  "errors.http422": "Shown to users when an API request fails with HTTP 422.",
  "errors.http429": "Shown to users when an API request fails with HTTP 429.",
  "errors.http500": "Shown to users when an API request fails with HTTP 500.",
};

function flatten(node, prefix, out) {
  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.push([fullKey, value]);
    } else if (value && typeof value === "object") {
      flatten(value, fullKey, out);
    } else {
      throw new Error(`Catalog key ${fullKey} is not a string (got ${typeof value})`);
    }
  }
}

const en = JSON.parse(fs.readFileSync(SRC, "utf8"));
const flat = [];
flatten(en, "", flat);
flat.sort((a, b) => a[0].localeCompare(b[0]));

const messages = flat.map(([key, value]) => {
  const lastDot = key.lastIndexOf(".");
  const entry = {
    msgid: lastDot === -1 ? key : key.slice(lastDot + 1),
    msgstr: value,
    ...(lastDot !== -1 && { msgctxt: key.slice(0, lastDot) }),
    ...(DESCRIPTIONS[key] && { extractedComments: [DESCRIPTIONS[key]] }),
  };
  return entry;
});

const po = poParser.serialize({
  meta: {
    Language: "en",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Transfer-Encoding": "8bit",
    "X-Generator": "next-intl",
    "X-Crowdin-SourceKey": "msgstr",
  },
  messages,
});

fs.writeFileSync(OUT, po);
console.log(`Wrote ${messages.length} entries to ${OUT}`);
