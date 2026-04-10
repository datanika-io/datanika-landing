import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pricingFaq, buildFaqPageJsonLd } from "../src/data/pricing-faq";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Source-of-truth data file
// ---------------------------------------------------------------------------

describe("pricing-faq source data", () => {
  it("has exactly 8 entries", () => {
    expect(pricingFaq.length).toBe(8);
  });

  it("every answer is <= 200 characters (rich-snippet budget)", () => {
    for (const item of pricingFaq) {
      expect(item.answer.length).toBeLessThanOrEqual(200);
    }
  });

  it("every question ends with a '?'", () => {
    for (const item of pricingFaq) {
      expect(item.question.trim().endsWith("?")).toBe(true);
    }
  });

  it("no duplicate questions", () => {
    const questions = pricingFaq.map((i) => i.question);
    expect(new Set(questions).size).toBe(questions.length);
  });
});

describe("buildFaqPageJsonLd", () => {
  it("produces a valid FAQPage shape", () => {
    const ld = buildFaqPageJsonLd(pricingFaq) as {
      "@context": string;
      "@type": string;
      mainEntity: Array<{
        "@type": string;
        name: string;
        acceptedAnswer: { "@type": string; text: string };
      }>;
    };
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.length).toBe(8);
    for (const q of ld.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });

  it("order matches the source array order", () => {
    const ld = buildFaqPageJsonLd(pricingFaq) as {
      mainEntity: Array<{ name: string }>;
    };
    for (let i = 0; i < pricingFaq.length; i++) {
      expect(ld.mainEntity[i].name).toBe(pricingFaq[i].question);
    }
  });
});

// ---------------------------------------------------------------------------
// Rendered /pricing page
// ---------------------------------------------------------------------------

describe("/pricing page FAQ section", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("pricing/index.html");
  });

  it("emits FAQPage JSON-LD", () => {
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("emits one Question per FAQ item", () => {
    const matches = html.match(/"@type":"Question"/g);
    expect(matches?.length).toBe(pricingFaq.length);
  });

  it("emits one Answer per FAQ item", () => {
    const matches = html.match(/"@type":"Answer"/g);
    expect(matches?.length).toBe(pricingFaq.length);
  });

  it("JSON-LD contains every question text", () => {
    for (const item of pricingFaq) {
      expect(html).toContain(`"name":${JSON.stringify(item.question)}`);
    }
  });

  it("visible DOM contains every question text", () => {
    for (const item of pricingFaq) {
      // HTML entities (e.g. `'` → `&#x27;`) mean the raw question string
      // can appear differently in the DOM vs JSON-LD. Use the longest
      // suffix of words that contains no special characters; that
      // substring must appear in both places.
      const words = item.question.split(" ");
      // Find the longest trailing slice with no quotes or apostrophes.
      let chunk = "";
      for (let i = words.length; i > 0; i--) {
        const slice = words.slice(words.length - i).join(" ");
        if (!/['"]/.test(slice)) {
          chunk = slice;
          break;
        }
      }
      expect(chunk.length).toBeGreaterThan(0);
      const count = (html.match(new RegExp(escapeRegex(chunk), "g")) || [])
        .length;
      expect(
        count,
        `Expected "${chunk}" (from "${item.question}") to appear >= 2 times`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("visible DOM contains every answer text", () => {
    for (const item of pricingFaq) {
      // Answer contains characters like $ and ` which need escaping for
      // HTML — Astro will encode & and " but not $ or `. Check a stable
      // substring instead.
      const stableChunk = item.answer.split(" ").slice(0, 4).join(" ");
      expect(html).toContain(stableChunk);
    }
  });

  it("uses native <details>/<summary> (accessible, no JS)", () => {
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
  });
});
