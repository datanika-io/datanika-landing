import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

/**
 * Guardrail: no built page sells an ETL/ELT **mode** a user can choose, and none says a dbt run
 * is **metered in bytes** (landing#656).
 *
 * ## What was false, measured 2026-09-22
 *
 * - **"Pick ELT, pay less."** The pricing pages and three `/pricing` FAQ answers (all in the
 *   `FAQPage` JSON-LD) described a per-pipeline ETL/ELT selector, a migrate button, and ELT
 *   metered at ~0.8 GB against ETL's ~3 GB. The served `/pipelines` chunk on app.datanika.io
 *   references **0** of the selector's 14 `pipelines.mode_*` keys and 33 of the form's 53
 *   `pipelines.*` keys (`datanika_dual_mode_ux_enabled` defaults `False`); re-read on a second
 *   build the same day, same result, with `plans/growth/scripts/app_bundle_keys.py`. This said
 *   "16" when it was written, counted by eye; 14 is counted from `en.json`. Even with the flag
 *   on, nothing writes a mode: the upload and pipeline services never pass one, and their
 *   update allowlists exclude it, so every row is `ETL`.
 * - **"We meter the scan"** / **"3.1 GB counted"**. Only `run.upload_completed` carries
 *   `bytes_processed`; the model and transformation completions carry none, and cloud records
 *   them as model runs instead.
 *
 * ## 🚦 Flip condition — delete a half of this in the PR that makes its claim true
 *
 * If Engineering ships a mode a user can select in production (the selector rendered on
 * app.datanika.io, a writer for `uploads.mode`, ELT uploads metered), delete the ELT patterns
 * in the same PR that restores the copy. If a dbt run ever carries bytes, delete the dbt ones.
 * **Failing there is the point**: a checklist item would rot, and a guard that outlives its
 * premise refuses true copy (the gate-2 lesson in `docs/GROWTH_RULES.md`).
 *
 * ## How it reads the site
 *
 * Every built route in `dist/`, twice: the text a reader sees (tags to a space), and the
 * machine-readable half — `<meta content>` and JSON-LD — because the FAQ answers shipped as
 * structured data too, where a text-only walk never looks.
 *
 * Dated correction paragraphs are excluded from the visible text, because a correction has to
 * NAME the claim it retracts (*"a banned-word rule fires inside its own negation"*). That
 * exclusion is **pinned to exactly the routes that carry one**, so it cannot quietly widen into a
 * place to hide the claim.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** A built page's text the way a browser shows it: tags to a space, whitespace collapsed. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#36;/g, "$")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

/** A dated correction, as the posts write it: `<p><em>Correction, 2026-09-22.</em> …</p>`. */
const CORRECTION = /^\s*Correction, \d{4}-\d{2}-\d{2}\./;

function withoutCorrections(html: string): { html: string; removed: string[] } {
  const removed: string[] = [];
  const kept = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, (whole, inner: string) => {
    if (CORRECTION.test(pageText(inner))) {
      removed.push(pageText(inner));
      return " ";
    }
    return whole;
  });
  return { html: kept, removed };
}

/** `<meta content="…">` values and JSON-LD bodies: the half a search engine reads. */
function machineReadable(html: string): string {
  const metas = [...html.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"/g)].map((m) => m[1]);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  return pageText([...metas, ...ld].join(" \n "));
}

interface Page {
  route: string;
  visible: string;
  machine: string;
  corrections: string[];
}

function builtPages(): Page[] {
  const out: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "index.html") {
        const rel = p.slice(DIST.length + 1).split(sep).join("/");
        const route = "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");
        const raw = readFileSync(p, "utf-8");
        const { html, removed } = withoutCorrections(raw);
        out.push({ route, visible: pageText(html), machine: machineReadable(raw), corrections: removed });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * The affirmative forms, each with the sentence it was written against. Generic industry use
 * ("an open-source ELT platform", "Evaluating ELT tools?") matches none of them, deliberately:
 * Datanika's extract-load-then-dbt flow IS ELT in the ordinary sense, and 29 built routes say so.
 */
const BANNED: { name: string; re: RegExp; sample: string; rendered: string }[] = [
  {
    // Anchored to the affirmative: "there is no ELT mode" is the correction, not the claim.
    name: "an ETL or ELT *mode*",
    re: /(?<!\bno\s)\b(?:ELT|ETL)\s+mode\b/i,
    sample: "When you select ELT mode on a Datanika pipeline",
    rendered: 'In <strong class="text-white">ETL mode</strong> (the dlt path)',
  },
  {
    name: "choosing ELT",
    re: /\b(?:pick|choose|select|switch(?:ing)?\s+to|flip(?:ping)?\s+to)\s+(?:the\s+)?ELT\b/i,
    sample: "Pick ELT, pay less",
    rendered: '<h2 class="text-3xl font-bold">Pick ELT, pay even less</h2>',
  },
  {
    name: "a mode selector",
    re: /\bmode\s+selector\b/i,
    sample: "The mode selector lives on every pipeline",
    rendered: "<p>The mode selector is on every pipeline.</p>",
  },
  {
    name: "a migrate button",
    re: /\bmigrate\s+button\b/i,
    sample: "Existing pipelines can flip modes with a migrate button.",
    rendered: "<p>flip modes with a <em>migrate button</em></p>",
  },
  {
    name: "ETL vs ELT metering",
    re: /\bETL\s+vs\.?\s+ELT\s+metering\b/i,
    sample: "tier breakdown, ETL vs ELT metering, FAQ",
    rendered: '<a href="/features/volume-pricing/">How it works — ETL vs ELT metering, FAQ →</a>',
  },
  {
    name: "ELT billed below ETL",
    re: /\bELT\b[^.?!]{0,60}\bcheaper than ETL\b/i,
    sample: "Why is ELT cheaper than ETL in your metering?",
    rendered: '<h3 class="font-bold mb-2">Why is ELT cheaper than ETL?</h3>',
  },
  {
    name: "a dbt scan metered",
    re: /\bmeter(?:s|ed)?\s+the\s+scan\b/i,
    sample: "re-running a dbt model re-scans the underlying tables and we meter the scan",
    rendered: "<p>we <strong>meter the scan</strong></p>",
  },
  {
    name: "a dbt summary counted against the quota",
    re: /\b3\.1\s*GB\s+counted\b/i,
    sample: "Total: 3.1 GB counted against your quota",
    rendered: '<span class="text-emerald-400 font-bold">3.1 GB counted against your quota</span>',
  },
  {
    name: "the transformation layer metered",
    re: /\bingestion\s+or\s+transformation\s+layer\b/i,
    sample: "that moves through our ingestion or transformation layer per billing period",
    rendered: "<p>through our ingestion or transformation layer</p>",
  },
];

/**
 * Sentences that must NOT trip a ban: the honest negation, and ordinary category use of "ELT".
 * A ban that fires on these goes red on correct copy and gets deleted rather than narrowed.
 */
const MUST_NOT_MATCH = [
  "There is no ELT mode to switch a Datanika pipeline to.",
  "Datanika is an open-source ELT platform — extraction, loading, transformation and scheduling.",
  "Evaluating ELT tools? Compare Datanika with Airbyte, Fivetran, Stitch, and Hevo.",
  "Run the whole ELT + dbt + scheduling platform on your own box.",
  "dbt model and transformation runs are not metered in bytes; each one counts as a model run.",
  "Output, after normalization: the bytes an upload writes.",
];

/** The two posts that retract these claims in a dated note, and nothing else. */
const RETRACTING_ROUTES = ["/blog/dlt-arrow-5x-faster-pipeline", "/blog/pricing-v2-math-and-why"];

describe("the meter is described as it works (landing#656)", () => {
  it("has a built site to read", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
    expect(builtPages().length).toBeGreaterThan(100);
  });

  it("every pattern matches its own sample, raw and rendered", () => {
    for (const b of BANNED) {
      expect(b.re.test(b.sample), `${b.name}: raw sample`).toBe(true);
      expect(b.re.test(pageText(b.rendered)), `${b.name}: rendered sample`).toBe(true);
    }
  });

  it("no pattern fires on the honest negation or on ordinary use of the word ELT", () => {
    for (const sentence of MUST_NOT_MATCH) {
      for (const b of BANNED) {
        expect(b.re.test(sentence), `${b.name} fires on: ${sentence}`).toBe(false);
      }
    }
  });

  it("no page says a user can choose an ETL/ELT mode, or that dbt runs are metered", { timeout: 30_000 }, () => {
    const hits: string[] = [];
    for (const page of builtPages()) {
      for (const b of BANNED) {
        for (const [half, text] of [["text", page.visible], ["meta/JSON-LD", page.machine]] as const) {
          const m = text.match(b.re);
          if (m) {
            const at = text.indexOf(m[0]);
            hits.push(`${page.route} [${half}] ${b.name}: "…${text.slice(Math.max(0, at - 60), at + 80)}…"`);
          }
        }
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("the correction exclusion covers exactly the two retracting posts", { timeout: 30_000 }, () => {
    const retracting = builtPages()
      .filter((p) => p.corrections.some((c) => BANNED.some((b) => b.re.test(c))))
      .map((p) => p.route);
    expect(retracting).toEqual(RETRACTING_ROUTES);
    // …and each one names the issue, so a reader can check the retraction.
    for (const p of builtPages().filter((x) => RETRACTING_ROUTES.includes(x.route))) {
      const notes = p.corrections.filter((c) => c.includes("landing#656"));
      expect(notes.length, `${p.route} carries one dated note citing landing#656`).toBe(1);
    }
  });

  /**
   * The presence half. A ban alone is satisfied by a page that simply stops describing the
   * meter, which would leave a Free user with no answer at all. Each needle is the SUBSTANCE of
   * the correction, short enough to survive rewording around it.
   */
  it("the pages that describe the meter say what it counts", () => {
    const pages = new Map(builtPages().map((p) => [p.route, p]));
    const must: [string, string][] = [
      ["/pricing", "a dbt re-run adds no GB"],
      ["/features/volume-pricing", "not metered in bytes"],
      ["/features/volume-pricing", "~3 GB counted against your quota"],
      ["/why-cheaper", "dbt model and transformation runs add nothing to it"],
      ["/blog/pricing-v2-math-and-why", "only uploads are metered in bytes"],
    ];
    for (const [route, needle] of must) {
      const page = pages.get(route);
      expect(page, `${route} did not build`).toBeTruthy();
      expect(page!.visible, `${route} no longer says: ${needle}`).toContain(needle);
    }
    // The structured data carries the same answer as the visible FAQ, not an older one.
    expect(pages.get("/pricing")!.machine).toContain("a dbt re-run adds no GB");
  });
});
