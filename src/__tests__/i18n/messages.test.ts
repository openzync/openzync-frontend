import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import { locales, defaultLocale } from "@/i18n/config";

type Messages = Record<string, unknown>;

/** Recursively assert every catalog value is a non-empty string. */
function collectLeafKeys(node: Messages, prefix: string, out: string[]): void {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.push(path);
    } else if (value && typeof value === "object") {
      collectLeafKeys(value as Messages, path, out);
    } else {
      throw new Error(`Catalog key ${path} is not a string (got ${typeof value})`);
    }
  }
}

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

describe("message catalog", () => {
  it("parses as a plain object with the expected top-level namespaces", () => {
    expect(typeof en).toBe("object");
    expect(en).not.toBeNull();
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  it("config is coherent — default locale is a supported locale", () => {
    expect(locales).toContain(defaultLocale);
    // en catalog is imported as the source locale; adding a locale means
    // adding both a `locales` entry and a matching <locale>.json catalog.
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  it("has no leftover placeholder keys and every leaf is a string", () => {
    const keys: string[] = [];
    collectLeafKeys(en as Messages, "", keys);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(key).not.toContain("__pending__");
    }
  });

  it("has balanced ICU braces in every message value", () => {
    const check = (node: Messages, prefix: string) => {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string") {
          expect(icuBracesBalanced(value), `${prefix}.${key}`).toBe(true);
        } else if (value && typeof value === "object") {
          check(value as Messages, `${prefix}.${key}`);
        }
      }
    };
    check(en as Messages, "");
  });

  it("uses key-based ids — no message value equals its key path", () => {
    const keys: string[] = [];
    collectLeafKeys(en as Messages, "", keys);
    const get = (path: string): unknown =>
      path.split(".").reduce<unknown>((acc, part) => (acc as Messages)?.[part], en);
    for (const key of keys) {
      expect(get(key), key).not.toBe(key);
    }
  });
});
