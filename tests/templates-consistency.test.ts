/**
 * Drift guardrail: public template metadata on the landing site must not
 * diverge from the in-app Python dataclass at
 * `datanika/data/pipeline_templates.py` (the technical source of truth).
 *
 * Enforces:
 *   1. Every TS template slug has a matching Python slug.
 *   2. Every Python slug has a matching TS template (no silent coverage gaps).
 *   3. `whatItLoads` is a subset of the Python `dlt_config_defaults["resources"]`
 *      when the Python side enumerates resources — no over-promising.
 *   4. Every template's source/destination connector slugs exist in
 *      `src/data/connectors.ts`, so the detail page's cross-links resolve.
 *
 * Same SoT pattern as `tests/agent-tiers-consistency.test.ts` (PR #108).
 * See plans/product/SPEC_PUBLIC_TEMPLATE_LANDING.md for rationale.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { templates, templateSlugs } from "../src/data/templates";
import { connectors } from "../src/data/connectors";

// The Python file lives in the sibling `datanika/` monorepo repo. Resolve
// relative to the landing worktree so the test works in CI (where only the
// landing repo is checked out) AND in local worktrees under d:/Projects/Datanika.
//
// Resolution order:
//   1. ../datanika/datanika/data/pipeline_templates.py  (sibling worktree layout)
//   2. ../../datanika/datanika/data/pipeline_templates.py  (worktrees/ layout)
//   3. skip the cross-repo assertions entirely (CI-only safety net)
function locatePythonSoT(): string | null {
  const candidates = [
    resolve(__dirname, "../../datanika/datanika/data/pipeline_templates.py"),
    resolve(__dirname, "../../../datanika/datanika/data/pipeline_templates.py"),
    resolve(__dirname, "../../datanika-core-product/datanika/data/pipeline_templates.py"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function extractPythonSlugs(source: string): string[] {
  const matches = Array.from(source.matchAll(/slug\s*=\s*"([a-z0-9-]+)"/g));
  return matches.map((m) => m[1]);
}

function extractPythonResources(source: string, slug: string): string[] | null {
  // Find the PipelineTemplate block containing this slug and pull the
  // `resources` list out of its dlt_config_defaults. This is a textual grep
  // so it doesn't need Python execution in the test runner.
  const blockRegex = new RegExp(
    `slug\\s*=\\s*"${slug}"[\\s\\S]*?dlt_config_defaults\\s*=\\s*\\{([\\s\\S]*?)\\}`,
    "m",
  );
  const blockMatch = source.match(blockRegex);
  if (!blockMatch) return null;
  const block = blockMatch[1];
  const resourcesMatch = block.match(/"resources"\s*:\s*\[([^\]]*)\]/);
  if (!resourcesMatch) return null;
  return Array.from(resourcesMatch[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

describe("templates SoT — shape invariants", () => {
  it("every template has required non-empty fields", () => {
    for (const tpl of templates) {
      expect(tpl.slug.length, `slug missing on template`).toBeGreaterThan(0);
      expect(tpl.h1.length).toBeGreaterThan(0);
      expect(tpl.seoTitle.length).toBeGreaterThan(0);
      expect(tpl.seoTitle.length, `${tpl.slug} seoTitle too long`).toBeLessThanOrEqual(70);
      expect(tpl.seoDescription.length).toBeGreaterThan(0);
      expect(
        tpl.seoDescription.length,
        `${tpl.slug} seoDescription should be ≤165 chars for SERP`,
      ).toBeLessThanOrEqual(165);
      expect(tpl.prerequisites.length).toBeGreaterThan(0);
      expect(tpl.description.length).toBeGreaterThan(20);
      expect(tpl.exampleSql.length).toBeGreaterThan(0);
    }
  });

  it("template slugs are unique", () => {
    const set = new Set(templateSlugs);
    expect(set.size).toBe(templates.length);
  });

  // Core #101's AuthState._post_auth_redirect_target() validates
  // ?template=<slug> against this regex; non-matching slugs silently drop to /.
  it("template slugs match core AuthState redirect regex", () => {
    const coreSlugRegex = /^[a-z0-9][a-z0-9-]{0,63}$/;
    for (const slug of templateSlugs) {
      expect(
        coreSlugRegex.test(slug),
        `slug '${slug}' violates core AuthState ?template= regex — cold-traffic auth redirect will silently fall back to /`,
      ).toBe(true);
    }
  });

  it("relatedTemplates references resolve to existing slugs", () => {
    for (const tpl of templates) {
      for (const rel of tpl.relatedTemplates) {
        expect(
          templateSlugs.includes(rel),
          `${tpl.slug}.relatedTemplates references unknown slug '${rel}'`,
        ).toBe(true);
        expect(rel, `${tpl.slug}.relatedTemplates self-references`).not.toBe(tpl.slug);
      }
    }
  });
});

describe("templates ↔ connectors.ts cross-reference", () => {
  const connectorSlugs = new Set(connectors.map((c) => c.slug));

  it("every template's source connector slug exists in connectors.ts", () => {
    for (const tpl of templates) {
      expect(
        connectorSlugs.has(tpl.sourceConnectorSlug),
        `${tpl.slug}.sourceConnectorSlug='${tpl.sourceConnectorSlug}' not in connectors.ts`,
      ).toBe(true);
    }
  });

  it("every template's destination connector slug exists in connectors.ts", () => {
    for (const tpl of templates) {
      expect(
        connectorSlugs.has(tpl.destinationConnectorSlug),
        `${tpl.slug}.destinationConnectorSlug='${tpl.destinationConnectorSlug}' not in connectors.ts`,
      ).toBe(true);
    }
  });
});

describe("templates ↔ Python SoT drift check", () => {
  const pythonPath = locatePythonSoT();

  // If the Python file can't be found (e.g., CI only checks out the landing
  // repo), skip the cross-repo assertions rather than fail. The shape
  // invariants above still guard the landing-side contract.
  const maybeIt = pythonPath ? it : it.skip;

  maybeIt("every TS template slug has a matching Python slug", () => {
    const source = readFileSync(pythonPath!, "utf-8");
    const pythonSlugs = new Set(extractPythonSlugs(source));
    for (const slug of templateSlugs) {
      expect(
        pythonSlugs.has(slug),
        `TS template '${slug}' has no matching Python PipelineTemplate. ` +
          `Add it to datanika/data/pipeline_templates.py or remove the TS entry.`,
      ).toBe(true);
    }
  });

  maybeIt("every Python slug has a matching TS template (no silent coverage gap)", () => {
    const source = readFileSync(pythonPath!, "utf-8");
    const pythonSlugs = extractPythonSlugs(source);
    const tsSlugs = new Set(templateSlugs);
    for (const slug of pythonSlugs) {
      expect(
        tsSlugs.has(slug),
        `Python PipelineTemplate '${slug}' has no public landing page. ` +
          `Add it to src/data/templates.ts so cold traffic can reach it.`,
      ).toBe(true);
    }
  });

  maybeIt("whatItLoads is a subset of Python resources when enumerated", () => {
    const source = readFileSync(pythonPath!, "utf-8");
    for (const tpl of templates) {
      if (tpl.whatItLoads.length === 0) continue; // Nothing to over-promise
      const pyResources = extractPythonResources(source, tpl.slug);
      if (pyResources === null) continue; // Python side doesn't enumerate
      for (const resource of tpl.whatItLoads) {
        expect(
          pyResources.includes(resource),
          `${tpl.slug}.whatItLoads['${resource}'] not in Python resources list [${pyResources.join(", ")}]. ` +
            `The public page is promising a resource the in-app template doesn't load.`,
        ).toBe(true);
      }
    }
  });
});
