import { describe, it, expect } from "vitest";
import { resolveEnrichment } from "@/components/shared/enrichment-badge";

// 319 = bits 0–5 + bit 8 (LLM invalidation, untracked by the badge).
// bit 7 (blob_text) is NOT set.
const BITS_319 = 319;
// 447 = 319 + bit 7 — every badge-tracked step complete.
const BITS_ALL_DONE = 319 | (1 << 7);

const ALL_ON: Record<string, boolean> = {
  entities: true,
  embedding: true,
  facts: true,
  entity_links: true,
  classification: true,
  structured: true,
  blob_text: true,
};

const ALL_OFF: Record<string, boolean> = {
  entities: false,
  embedding: false,
  facts: false,
  entity_links: false,
  classification: false,
  structured: false,
  blob_text: false,
};

describe("resolveEnrichment", () => {
  it("319 without blobs → Enriched (blob_text skipped: no attachments)", () => {
    const { overall, steps } = resolveEnrichment(BITS_319, ALL_ON, false);

    expect(overall).toBe("enriched");
    const blob = steps.find((s) => s.key === "blob_text");
    expect(blob).toMatchObject({ state: "skipped", reason: "no attachments" });
  });

  it("319 with blobs → Enriching (blob_text pending)", () => {
    const { overall, steps } = resolveEnrichment(BITS_319, ALL_ON, true);

    expect(overall).toBe("enriching");
    const blob = steps.find((s) => s.key === "blob_text");
    expect(blob).toMatchObject({ state: "pending" });
  });

  it("isSkipped=true → Skipped, overriding full bits", () => {
    const { overall, steps } = resolveEnrichment(BITS_ALL_DONE, ALL_ON, true, true);

    expect(overall).toBe("skipped");
    // Every enabled step reports gate-skipped, even fully-set bits.
    for (const step of steps) {
      expect(step).toMatchObject({ state: "skipped", reason: "gate-skipped" });
    }
  });

  it("a disabled toggle marks that step skipped (toggle off)", () => {
    const { steps } = resolveEnrichment(
      0,
      { ...ALL_ON, facts: false },
      false,
    );

    const facts = steps.find((s) => s.key === "facts");
    expect(facts).toMatchObject({ state: "skipped", reason: "toggle off" });
  });

  it("all toggles off → overall Skipped", () => {
    const { overall } = resolveEnrichment(0, ALL_OFF, false);

    expect(overall).toBe("skipped");
  });
});
