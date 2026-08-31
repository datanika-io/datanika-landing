import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * The Stripe dbt tutorial names UI surfaces that do not exist (landing#368).
 *
 * ## Why this exists
 *
 * #368's first pass fixed the two *form controls* the post invented — a write
 * disposition and a target-schema field, neither of which a SaaS source
 * renders — and taught the real derivation instead. That fix was correct and
 * is unchanged here.
 *
 * It also left the post naming four **navigation** targets that do not exist,
 * and introduced none of them: they had been there since 2026-07-20. So the
 * post parsed, taught the right mental model, and still could not be followed:
 *
 *   - "Click **Run now**" — the button is **Run**, `common.run`, rendered on
 *     the upload's own row (`ui/pages/uploads.py:424`). Every connector guide
 *     already says so explicitly: *"There is no 'Run now' on a pipeline page."*
 *   - "watch the **per-resource row counts**" — `_extract_rows_loaded()`
 *     returns `sum(...)` over `NormalizeInfo.row_counts`, stored in the single
 *     `Run.rows_loaded` column. The per-table breakdown is discarded before it
 *     reaches the UI; the Runs table's **Rows** is one total per run.
 *   - "open **Catalog → your warehouse**" (x3) — there is no Catalog route and
 *     no Catalog sidebar entry. The catalog browser is **Models** (`/models`),
 *     and both the sidebar link and the page `<h1>` read *Models*
 *     (`layout.py:134`, `models.py:99` -> `nav.models`). The only UI string
 *     reading "Catalog" is `connections.catalog`, a **Databricks connection
 *     field** — so a reader hunting for Catalog finds an unrelated form input.
 *   - "Check your own numbers in **Usage**" — no Usage page or nav entry. It is
 *     the **Plan Usage** panel on the Dashboard (`dashboard.py:306`).
 *
 * A fifth, same family: the post promised dlt's `_dlt_loads` /
 * `_dlt_pipeline_state` / `_dlt_version` tables would appear alongside the
 * landed ones. `CatalogService` skips any table starting with `_dlt_`, so they
 * never show — the reader was told to look for absence-as-success.
 *
 * All verified against core `master` @ `de5918e`, the SHA serving production.
 *
 * ## 🚨 Count the instruction, not the phrase
 *
 * `grep "Run now"` over `src/content/` returns ~25 connector guides, and every
 * one of them is **correct** — they were swept to *deny* the control:
 * *"There is no 'Run now' on a pipeline page."* A matcher on the bare phrase
 * would fail the build on the copy that fixed this class. The matchers below
 * are therefore shaped to the *imperative*, and the negative control at the
 * bottom pins both directions: they fire on the retired instruction and stay
 * silent on the denial.
 */

/**
 * Both Growth posts that walk a reader through the app. `customer-360` builds
 * on the Stripe tutorial and inherited the same Catalog instruction three
 * times; it is scheduled for 2026-09-07 and still 404s, so it was corrected
 * before publication rather than after.
 *
 * The 34 connector guides carry the Catalog defect too. They are **not** in
 * scope here: that is a Product-owned sweep, filed separately, and adding them
 * to this list before the sweep would fail the build on 34 files nobody is
 * fixing today.
 */
const POSTS = [
  "stripe-revenue-dashboard-dbt.md",
  "customer-360-hubspot-stripe.md",
] as const;

const read = (name: string) =>
  readFileSync(resolve(__dirname, "../src/content/blog", name), "utf-8");

const src = read("stripe-revenue-dashboard-dbt.md");

/**
 * Each entry is an instruction that only makes sense if a surface exists that
 * does not. `why` is what a reader would go looking for and never find.
 */
const PHANTOM_NAV: { re: RegExp; why: string }[] = [
  {
    re: /\bclick \*\*Run now\*\*/i,
    why: 'the button is **Run** (`common.run`), on the upload\'s row on `/uploads`',
  },
  {
    re: /per-resource row counts/i,
    why: "`Run.rows_loaded` is one summed total; there is no per-endpoint breakdown",
  },
  {
    re: /\bopen \*\*Catalog\b/i,
    why: "there is no Catalog page or sidebar entry — it is **Models**, at `/models`",
  },
  {
    re: /\bCatalog (?:tab|→)/i,
    why: "same: the catalog browser is **Models**",
  },
  {
    re: /\byour Catalog\b/i,
    why: "same: the catalog browser is **Models**",
  },
  {
    re: /\bin \*\*Usage\*\*/i,
    why: "no Usage page — it is the **Plan Usage** panel on the Dashboard",
  },
  {
    re: /alongside dlt's `_dlt_loads`/i,
    why: "`CatalogService` filters out every `_dlt_*` table, so they never appear",
  },
];

describe("the walkthrough posts do not send readers to surfaces that do not exist", () => {
  const CASES = POSTS.flatMap((post) =>
    PHANTOM_NAV.map((p) => [`${post} :: ${p.re.source}`, post, p] as const),
  );

  it.each(CASES)("%s", (_label, post, phantom) => {
    expect(
      phantom.re.test(read(post)),
      `${post} matched ${phantom.re} — ${phantom.why}. ` +
        `Re-derive before restoring this: gh api ` +
        `repos/datanika-io/datanika-core/tarball/master, then read ` +
        `datanika/ui/components/layout.py (the sidebar), datanika/i18n/en.json ` +
        `(the labels) and datanika/services/catalog_service.py.`,
    ).toBe(false);
  });

  /**
   * The positive half. Deleting the phantom instructions without naming the
   * real surface leaves a reader who cannot finish the tutorial and has no
   * route — and an absence-only check cannot tell that apart from a fix. This
   * is the same reason the MongoDB `auth_source` guard asserts the raw-JSON
   * escape hatch rather than only the absence of the field.
   */
  it.each(POSTS)("%s names the surfaces that do exist", (post) => {
    const body = read(post);
    expect(body, `${post} no longer points at Models`).toMatch(/\*\*Models\*\*/);
    expect(body, `${post} no longer gives the /models route`).toContain("`/models`");
  });

  it("the Stripe tutorial names the run and usage surfaces too", () => {
    expect(
      /the button is \*\*Run\*\*/i.test(src),
      "the post no longer tells the reader what the run control is actually called",
    ).toBe(true);
    expect(
      /\*\*Plan Usage\*\* panel/i.test(src),
      "the post no longer names the real usage surface",
    ).toBe(true);
  });

  /**
   * The schema derivation #368's first pass established. Re-asserted here so a
   * later edit cannot quietly reintroduce the original defect while this file
   * guards only the navigation half.
   */
  it("still teaches the real schema derivation", () => {
    expect(src, "the Raw Stripe -> raw_stripe naming trick is gone").toContain("`Raw Stripe`");
    expect(
      /no write-disposition, load-mode, source-schema or table-name control/i.test(src),
      "the SaaS-has-no-such-control callout is gone",
    ).toBe(true);
  });

  it("the matchers fire on the retired copy and spare the denial", () => {
    // Live on datanika.io until this commit.
    const retired = [
      "4. Click **Run now** and watch the per-resource row counts in the **Runs** tab.",
      "When it finishes, open **Catalog → your warehouse** and find the schema.",
      "Keep that Catalog tab open; you'll use it to check exact column names as you write models too.",
      "check your Catalog and convert in staging if needed.",
      "Check your own numbers in **Usage** rather than trusting that sentence.",
      "and so on, alongside dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables.",
    ];
    for (const sample of retired) {
      expect(
        PHANTOM_NAV.some((p) => p.re.test(sample)),
        `no matcher catches retired copy: ${sample.slice(0, 70)}`,
      ).toBe(true);
    }

    // 🚨 The other direction, and the one that makes this test safe to widen:
    // the ~25 connector guides say "Run now" in order to DENY it. A matcher
    // that cannot tell an instruction from a denial would fail the build on
    // the sweep that fixed this exact class (landing#272/#285).
    const denials = [
      'On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload\'s own row.',
      "the button is **Run**, and the trigger lives on the upload's own row, not on a pipeline page",
    ];
    for (const sample of denials) {
      expect(
        PHANTOM_NAV.some((p) => p.re.test(sample)),
        `a matcher fires on correct copy that denies the control: ${sample.slice(0, 70)}`,
      ).toBe(false);
    }
  });
});
