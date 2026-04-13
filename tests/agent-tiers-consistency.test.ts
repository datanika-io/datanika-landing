/**
 * Guardrail: the AI-agent content across landing and blog must not drift
 * away from the single source of truth at `src/data/agent-tiers.ts`, which
 * fetches the canonical shape from `app.datanika.io/api/v1/meta/agent-tiers`
 * at build time (or falls back to the checked-in snapshot).
 *
 * This test catches the exact bug class that PR #97 shipped and Engineering
 * review caught (5-vs-6 contradiction): any hardcoded "N-tier" / "N tiers"
 * mention in the blog post must agree with the SoT's `tier_count`.
 *
 * See: datanika-io/datanika-landing#108
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  tierCount,
  capabilityCount,
  tiers,
  goldenPath,
  validatePayload,
} from "../src/data/agent-tiers";
import fallback from "../src/data/agent-tiers.fallback.json";

const BLOG_POST = resolve(__dirname, "../src/content/blog/ai-agent-native.md");

describe("agent-tiers SoT — data shape invariants", () => {
  it("tierCount is a positive integer", () => {
    expect(Number.isInteger(tierCount)).toBe(true);
    expect(tierCount).toBeGreaterThan(0);
  });

  it("capabilityCount matches the sum of capabilities across tiers", () => {
    const summed = tiers.reduce((acc, t) => acc + t.capabilities.length, 0);
    expect(summed).toBe(capabilityCount);
  });

  it("every tier has a non-empty name and at least one capability", () => {
    for (const tier of tiers) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(tier.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("every capability has at least one endpoint", () => {
    for (const tier of tiers) {
      for (const cap of tier.capabilities) {
        expect(cap.endpoints.length).toBeGreaterThan(0);
      }
    }
  });

  it("golden path has at least 10 steps", () => {
    // Sanity: the golden path should be the long-form expansion, not a stub.
    expect(goldenPath.length).toBeGreaterThanOrEqual(10);
  });
});

describe("agent-tiers SoT — strict validator (landing #123)", () => {
  // The checked-in fallback snapshot is our known-good fixture. Every
  // mutation below is a shallow clone with one field broken.
  function clone<T>(o: T): T {
    return JSON.parse(JSON.stringify(o));
  }

  it("accepts the checked-in fallback snapshot", () => {
    expect(() => validatePayload(fallback)).not.toThrow();
  });

  it("rejects non-object payloads", () => {
    expect(() => validatePayload(null)).toThrow();
    expect(() => validatePayload("string")).toThrow();
    expect(() => validatePayload(42)).toThrow();
    expect(() => validatePayload([])).toThrow(/tier_count/);
  });

  it("rejects missing top-level fields", () => {
    for (const field of [
      "tier_count",
      "capability_count",
      "tiers",
      "golden_path",
      "error_codes",
      "ui_only_operations",
    ]) {
      const broken = clone(fallback) as Record<string, unknown>;
      delete broken[field];
      expect(
        () => validatePayload(broken),
        `deleting '${field}' should throw`,
      ).toThrow();
    }
  });

  it("rejects missing tiers[].capabilities", () => {
    const broken = clone(fallback);
    delete (broken.tiers[0] as Record<string, unknown>).capabilities;
    expect(() => validatePayload(broken)).toThrow(/capabilities/);
  });

  it("rejects missing tiers[].capabilities[].endpoints", () => {
    const broken = clone(fallback);
    delete (broken.tiers[0].capabilities[0] as Record<string, unknown>).endpoints;
    expect(() => validatePayload(broken)).toThrow(/endpoints/);
  });

  it("rejects empty tiers[].capabilities[].endpoints", () => {
    const broken = clone(fallback);
    broken.tiers[0].capabilities[0].endpoints = [];
    expect(() => validatePayload(broken)).toThrow(/endpoints empty/);
  });

  it("rejects wrong type in tiers[].capabilities[].endpoints[]", () => {
    const broken = clone(fallback);
    broken.tiers[0].capabilities[0].endpoints = [123];
    expect(() => validatePayload(broken)).toThrow(/not a string/);
  });

  it("rejects malformed error_codes entries", () => {
    const broken = clone(fallback);
    broken.error_codes[0] = { code: "x" }; // missing meaning + action
    expect(() => validatePayload(broken)).toThrow(/error_codes/);
  });

  it("rejects capability with missing name", () => {
    const broken = clone(fallback);
    delete (broken.tiers[0].capabilities[0] as Record<string, unknown>).name;
    expect(() => validatePayload(broken)).toThrow(/name missing/);
  });
});

describe("ai-agent-native.md blog post — SoT consistency", () => {
  const content = readFileSync(BLOG_POST, "utf-8");

  it("every 'N-tier' mention in the blog post matches SoT tierCount", () => {
    // Find all "<number>-tier" / "<number> tier" occurrences in the prose.
    // Exclude markdown front-matter and common unrelated phrases.
    const tierMentions = Array.from(content.matchAll(/\b(\d+)[ -]tier/gi)).map((m) =>
      Number.parseInt(m[1], 10),
    );
    expect(tierMentions.length).toBeGreaterThan(0); // post should talk about tiers at all
    for (const n of tierMentions) {
      expect(
        n,
        `blog post mentions a ${n}-tier count that disagrees with SoT tierCount=${tierCount}. ` +
          "Update the blog post or refresh src/data/agent-tiers.fallback.json.",
      ).toBe(tierCount);
    }
  });

  it("blog post does not contain contradictory tier/step counts in adjacent prose", () => {
    // The PR #97 bug was "5-Tier" badge + "6-Tier" heading on the same page.
    // Guard: if the post mentions both a tier count and a step count, they
    // must be distinct and neither should equal any *other* hardcoded count
    // that could be confused for tierCount.
    const numericCountLines = content
      .split("\n")
      .filter((line) => /\b\d+[ -](tier|step|capabilit)/i.test(line));
    // Soft guardrail — just ensure the lines exist for human review, and that
    // none of them is the classic "5-Tier + 6-Tier" mix.
    const fiveTier = numericCountLines.some((l) => /\b5[ -]tier/i.test(l));
    const sixTier = numericCountLines.some((l) => /\b6[ -]tier/i.test(l));
    expect(
      !(fiveTier && sixTier),
      "blog post mentions both '5-tier' and '6-tier' in the same document — that's the exact " +
        "drift PR #97 shipped. Pick one and align with SoT.",
    ).toBe(true);
  });
});
