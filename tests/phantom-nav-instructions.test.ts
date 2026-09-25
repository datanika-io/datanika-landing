import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
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
 * ✅ **The connector guides are now in scope too — see the second describe
 * block below.** They were deferred here as "a Product-owned sweep, filed
 * separately"; that sweep is landing#401 and it has landed.
 *
 * ⚠️ **It was 36 guides, not the 34 recorded.** The count of 34 came from a
 * pattern requiring `**Catalog**` with its closing asterisks, which misses the
 * `**Catalog → \`<your warehouse>\`**` variant in `json.md` and `parquet.md`.
 * Same lesson as the "count the instruction, not the phrase" note above, in the
 * mirror direction: a matcher too *narrow* under-reports, and the two files it
 * skipped are file connectors that other work treats as ready.
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
    // ⚠️ Case-SENSITIVE, and not followed by a dot — both deliberate, and the
    // connector corpus is what forced it. Databricks' guide legitimately says
    // "Replace `main.raw_data` with your catalog.schema", which is Unity
    // Catalog's namespace vocabulary in a SQL GRANT, not a Datanika page. The
    // `/i` form fired on it. Datanika's page name was always capitalised and
    // never a SQL identifier, so capitalisation plus the negative lookahead
    // separates the two cleanly. Pinned in the negative control below.
    re: /\byour \*{0,2}Catalog\b(?!\.)/,
    why: "same: the catalog browser is **Models**",
  },
  {
    re: /\bin \*\*Usage\*\*/i,
    why: "no Usage page — it is the **Plan Usage** panel on the Dashboard",
  },
  {
    // Shaped to the *adjacency promise*, which is the defect: "you will see your
    // tables next to dlt's". The corrected copy still names the `_dlt_*` tables —
    // deliberately, so a reader querying the warehouse directly is not surprised —
    // but says Models does not list them. A matcher on `_dlt_loads` alone would
    // fire on that correction, which is the whole trap this file is about.
    re: /(?:alongside|next to|beside) dlt'?s?(?: own)? `_dlt_loads`/i,
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

/**
 * The connector-guide corpus and the template it is written from (landing#401).
 *
 * ## Why the template is the important half
 *
 * landing#272 / #285 already swept these guides once. It did not hold, because
 * both passes fixed the 36 *outputs* and left `_template.md` — the file every
 * new guide is copied from — still teaching "click **Run now**" and
 * "open **Catalog → <warehouse> → `raw_<source>`**". Nothing read the template:
 * it is not a page, so no page test globbed it, and Astro's content loader
 * scans `src/content/connectors` while the template lives under
 * `src/pages/docs/connectors`. A defect with a source and no guard regenerates.
 *
 * So this block asserts the template explicitly, by path, and would have failed
 * on the template alone while all 36 guides were green.
 *
 * ## What was actually wrong, measured
 *
 *   * **36 of 36** guides said "open **Catalog**" — a page with no route and no
 *     nav entry. It is **Models**, at `/models`.
 *   * **32 of 36** promised dlt's `_dlt_*` bookkeeping tables would appear next
 *     to the landed data. `CatalogService._table_metadata()` `continue`s on any
 *     table starting with `_dlt_`, so they never appear — the guides told the
 *     reader to read a correct result as a partial failure.
 *   * "Run now" appears in **32** guides and **every one is correct** — they say
 *     it to deny it. 0 defects. Same for "Configure pipeline" (32, all denials).
 *     A phrase matcher would have failed the build on the copy that fixed this.
 */
describe("the connector guides and their template name surfaces that exist", () => {
  const GUIDE_DIR = resolve(__dirname, "../src/content/connectors");
  const TEMPLATE = resolve(__dirname, "../src/pages/docs/connectors/_template.md");

  const guides = readdirSync(GUIDE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const readGuide = (name: string) => readFileSync(resolve(GUIDE_DIR, name), "utf-8");

  it("the corpus is the size this guard was derived against", () => {
    // An under-populated run must FAIL, not pass quietly. If the directory moves
    // or the glob stops matching, every it.each below silently becomes zero cases
    // and the suite still goes green — the failure mode this project keeps hitting.
    // 37 since landing#508 added `openapi` — the connector that was pickable in
    // the product while the site documented it nowhere. Bump this deliberately
    // when a guide is added; it is a tripwire against the glob silently
    // matching nothing, not a target.
    expect(guides.length, `expected 37 connector guides in ${GUIDE_DIR}`).toBe(37);
  });

  const CASES = guides.flatMap((g) =>
    PHANTOM_NAV.map((p) => [`${g} :: ${p.re.source}`, g, p] as const),
  );

  it.each(CASES)("%s", (_label, guide, phantom) => {
    expect(
      phantom.re.test(readGuide(guide)),
      `${guide} matched ${phantom.re} — ${phantom.why}.`,
    ).toBe(false);
  });

  // The positive half. Deleting a wrong instruction without naming the real
  // surface leaves the reader with no route, and an absence-only check cannot
  // tell that apart from a fix.
  //
  // 🔴 WIDENED 2026-09-16, from "every guide names Models" to the invariant that rule was
  // standing in for: **every guide tells the reader where to confirm the data landed.**
  // The old form named the INSTANCE and therefore went red on a correct change.
  // landing#604 measured that `/models` lists NOTHING for a ClickHouse destination — a run
  // that finished `success` with 7,182 rows across four tables produced zero `catalog_entries`
  // rows — so requiring the ClickHouse guide to send readers to Models was requiring it to
  // print a false instruction. A guide may satisfy this either way; one that does NEITHER
  // still fails, which is the property worth keeping.
  const NAMES_MODELS = (b: string) => /\*\*Models\*\*/.test(b) && b.includes("`/models`");
  const SAYS_MODELS_IS_BLIND = (b: string) =>
    /\/models\S*\s+does not list/i.test(b) && b.includes("```sql");

  it.each(guides)("%s tells the reader where to confirm the data landed", (guide) => {
    const body = readGuide(guide);
    expect(
      NAMES_MODELS(body) || SAYS_MODELS_IS_BLIND(body),
      `${guide} neither points at Models (both the name and the \`/models\` route) nor states ` +
        `that Models does not list this destination AND gives a query instead. One of the two ` +
        `is required: deleting a wrong instruction without naming the real surface leaves the ` +
        `reader with no way to check their data arrived.`,
    ).toBe(true);
  });

  it.each(guides)("%s, if it mentions the _dlt_ tables, says what will show them", (guide) => {
    const body = readGuide(guide);
    if (!body.includes("_dlt_loads")) return; // 4 file guides never raise the topic.
    expect(
      /Models does not list them/i.test(body) || SAYS_MODELS_IS_BLIND(body),
      `${guide} names the _dlt_* tables without telling the reader whether to expect to see ` +
        `them, so a correct result reads as a partial load.`,
    ).toBe(true);
  });

  // Controls. Widening a guard and gutting one look identical from the outside, so both arms
  // must be shown able to fail, and the widened rule must still refuse a guide that does
  // neither. Without these, "I made the test pass" is the only thing the change demonstrates.
  describe("the where-to-verify rule discriminates", () => {
    const MODELS_SHAPE = "open **Models** (`/models`) and browse the landed tables";
    const BLIND_SHAPE = "`/models` does not list what a ClickHouse load landed\n\n```sql\nSELECT 1;\n```";

    it("accepts a guide that points at Models", () => {
      expect(NAMES_MODELS(MODELS_SHAPE)).toBe(true);
      expect(SAYS_MODELS_IS_BLIND(MODELS_SHAPE)).toBe(false);
    });

    it("accepts a guide that says Models is blind and supplies a query", () => {
      expect(SAYS_MODELS_IS_BLIND(BLIND_SHAPE)).toBe(true);
      expect(NAMES_MODELS(BLIND_SHAPE)).toBe(false);
    });

    it("REFUSES a guide that does neither", () => {
      const gutted = "When it finishes, check your warehouse.";
      expect(NAMES_MODELS(gutted) || SAYS_MODELS_IS_BLIND(gutted)).toBe(false);
    });

    it("REFUSES a blindness claim with no query to replace the route", () => {
      expect(SAYS_MODELS_IS_BLIND("`/models` does not list what a ClickHouse load landed.")).toBe(false);
    });
  });

  describe("_template.md — the generator, unguarded until landing#401", () => {
    const tpl = () => readFileSync(TEMPLATE, "utf-8");

    it.each(PHANTOM_NAV.map((p) => [p.re.source, p] as const))(
      "the template does not teach %s",
      (_label, phantom) => {
        expect(
          phantom.re.test(tpl()),
          `_template.md matched ${phantom.re} — ${phantom.why}. This file is copied ` +
            `into every new connector guide, so a defect here regenerates into all of ` +
            `them (landing#401).`,
        ).toBe(false);
      },
    );

    it("teaches the controls that exist", () => {
      const body = tpl();
      for (const [needle, why] of [
        ["`/uploads`", "extract-load is configured at /uploads, not on the connection"],
        ["click **Run**", "the run control is Run, on the upload's own row"],
        ["**Models**", "the landed tables are browsed in Models"],
        ["`/models`", "…at the /models route"],
        ["`/schedules`", "schedules are their own page"],
      ] as const) {
        expect(body, `_template.md no longer says ${needle} — ${why}`).toContain(needle);
      }
    });

    it("does not teach a schema the reader cannot type", () => {
      // landing#368's original defect, still in the generator after that fix.
      // Upload names are validated ^[a-zA-Z0-9 ]+$, so `raw_stripe` cannot be
      // entered; the schema is derived from the upload name, and `Raw Stripe`
      // is how you get the underscore.
      expect(
        /target schema \(e\.g\., `raw_<source>`\)|schema \(e\.g\., `raw_/i.test(tpl()),
        "_template.md still instructs a `raw_<source>` target schema. There is no " +
          "target-schema field, and the underscore form is not typeable.",
      ).toBe(false);
      // 🔴 REPOINTED 2026-09-25 (landing#715). This asserted the PRESENCE of the
      // string "named after the upload" — and the corrected template contains that
      // string inside its own prohibition ("Do NOT write …"), so the old form passed
      // on a template teaching EITHER thing. Measured: 367/367 green against the
      // corrected file BEFORE this repoint. That is WORKFLOW_RULES §4's
      // denial-satisfies-the-guard trap arriving through a POSITIVE assertion.
      //
      // The invariant is not a phrase. It is: the template must teach that the
      // destination schema is DERIVED from the upload's name, because core's
      // to_snake_case = re.sub(r"\s+", "_", name.strip()).lower() folds whitespace
      // runs to single underscores and lower-cases the result.
      for (const [re, why] of [
        [/derived from the upload's name/i, "the schema is derived, not copied verbatim"],
        [/lower-cas/i, "to_snake_case lower-cases the whole thing"],
        [/underscore/i, "whitespace runs become single underscores"],
      ] as const) {
        expect(
          re.test(tpl()),
          `_template.md no longer explains that ${why} (${re}) — landing#715. This ` +
            `file is copied into every new connector guide, so a terse claim here ` +
            `regenerates into all of them.`,
        ).toBe(true);
      }
      // …and the unqualified claim must not be INSTRUCTED. Count the instruction,
      // not the phrase: any surviving occurrence has to sit on a "Do NOT" line.
      const unqualified = tpl()
        .split(/\r?\n/)
        .filter((l) => /named after the upload/i.test(l) && !/Do NOT/i.test(l));
      expect(
        unqualified,
        `_template.md instructs the unqualified "named after the upload" claim on ` +
          `${unqualified.length} line(s): ${unqualified.join(" | ")}`,
      ).toEqual([]);
    });
  });

  it("the matchers fire on the retired guide copy and spare the corrections", () => {
    // Every one of these was live on datanika.io before landing#401.
    const retired = [
      "3. When it finishes, open **Catalog** and browse the landed tables.",
      "3. When the run finishes, open **Catalog → `<your warehouse>`** and you'll see the root table plus any child tables created from nested arrays.",
      "creates schema `airtabledailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables.",
      "creates schema `customerorderssync` in the destination, alongside dlt's own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables.",
      "3. When the run finishes, open **Catalog → <warehouse> → `raw_<source>`** to browse the landed tables.",
      "1. From the pipeline page, click **Run now**.",
    ];
    for (const sample of retired) {
      expect(
        PHANTOM_NAV.some((p) => p.re.test(sample)),
        `no matcher catches retired copy: ${sample.slice(0, 70)}`,
      ).toBe(true);
    }

    // 🚨 The direction that matters more. These are all CORRECT sentences that
    // contain the defective phrases in order to deny them, or that name the
    // `_dlt_*` tables while saying they are hidden. A matcher that fires on any
    // of these would fail the build on the sweep that fixed this class — twice
    // over, since #272/#285 wrote the denials and #401 wrote the corrections.
    const corrections = [
      'On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload\'s own row.',
      'There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.',
      "When it finishes, open **Models** (`/models`) and browse the landed tables.",
      "dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load.",
      "- **Catalog** — the Unity Catalog catalog name, e.g. `main`.",
      "Use Unity Catalog grants to scope permissions tightly.",
      // The line that caught the `/i` form of the `your Catalog` matcher.
      "**Fix.** As a catalog admin, run: `GRANT USE SCHEMA, CREATE TABLE, MODIFY ON SCHEMA main.raw_data TO \\`datanika-loader\\`;`. Replace `main.raw_data` with your catalog.schema.",
      "you can see column counts and last-run status directly in the Data Catalog, no SQL required.",
      "GRANT USAGE ON SCHEMA raw_data TO datanika_loader;",
    ];
    for (const sample of corrections) {
      expect(
        PHANTOM_NAV.some((p) => p.re.test(sample)),
        `a matcher fires on correct copy: ${sample.slice(0, 90)}`,
      ).toBe(false);
    }
  });
});

/**
 * 🔴 landing#724 — THE RULE DIRECTLY ABOVE WAS ENFORCED AGAINST `_template.md` AND NOTHING ELSE.
 *
 * The `does not teach a schema the reader cannot type` block requires `_template.md` to explain
 * that the destination schema is **derived** from the upload's name, and forbids the unqualified
 * "named after the upload" *instruction* there. landing#715 then swept the precise wording into
 * **38 connector guides**. The blog was in no path set at all, and carried the unqualified claim
 * in **5 posts with 0 in the precise form** — measured 2026-09-26, with a fabricated-phrase
 * control matching 0 posts and a known-present control matching 7, so that zero is a reading
 * about the corpus and not about the pattern.
 *
 * ## Why the blog is where this bites hardest, not merely where it was missed
 *
 * Two of the five teach the reader, **in the same post**, that a spaced upload name is kept
 * verbatim — `google-sheets-share-step` says so sixteen lines above its own schema sentence.
 * Core keeps spaces (`upload_state.py:103`, `re.sub(r"[^a-zA-Z0-9 ]", "", value)`) and then
 * derives the schema with `to_snake_case = re.sub(r"\s+", "_", name.strip()).lower()`. So a
 * reader who takes the post's own advice and types `Sheets Daily Sync` hunts for a schema of
 * that name and finds `sheets_daily_sync`. Those posts were self-contradictory, not just terse.
 *
 * ## The population is a GLOB, deliberately
 *
 * `POSTS` at the top of this file is a two-entry enumeration, and an enumeration is a
 * measurement with a timestamp on it: `airtable-linked-records` (published 2026-09-23) arrived
 * after it was written and was invisible to it. This block globs the corpus, so the next post
 * carrying the claim is caught on the day it lands rather than when somebody remembers a list.
 *
 * ## What this guard CANNOT see, stated so a green is not over-read
 *
 * It selects the claim in the two forms we actually write (`schema … named after the upload`,
 * `schema … derived from the upload's name`). A post inventing a third phrasing — "the upload's
 * name becomes the schema" — would escape selection and read as clean. The controls at the
 * bottom pin the two known forms in both directions; they do not make the matcher exhaustive.
 */
describe("no blog post says the destination schema is copied from the upload's name", () => {
  const BLOG_DIR = resolve(__dirname, "../src/content/blog");
  const posts = readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const readPost = (name: string) => readFileSync(resolve(BLOG_DIR, name), "utf-8");

  /**
   * The CLAIM, not a phrase. Both verbs are matched on purpose: the fix rewrites
   * "named after" to "derived from", and the requirement below has to keep applying
   * afterwards — otherwise the guard retires itself the moment it is satisfied, which is
   * WORKFLOW_RULES §5a's release-condition trap.
   */
  const CLAIMS_SCHEMA_FROM_NAME =
    /schema\b[^.\n]{0,80}\b(?:named after|derived from)\b[^.\n]{0,40}\bupload\b/i;

  /** Asserted as the PRESENCE of the two things core actually does, never as a word ban. */
  const STATES_TRANSFORM = (text: string) =>
    /underscore/i.test(text) && /lower-cas/i.test(text);

  /**
   * Scoped to the PARAGRAPH, not the file and not the line. Not the file, because the word
   * "underscore" forty lines away would satisfy it. Not the line, because a claim that ever
   * spans a wrap would slip through — the defect the coordinator hit twice on 2026-09-25.
   */
  const claimParagraphs = (text: string) =>
    text.split(/\r?\n[ \t]*\r?\n/).filter((p) => CLAIMS_SCHEMA_FROM_NAME.test(p));

  it("the corpus is the size this guard walks", () => {
    // A tripwire against the glob silently matching nothing, not a target: every case
    // below would vanish and the suite would still go green. 63 posts at landing#724.
    expect(posts.length, `expected a populated blog corpus at ${BLOG_DIR}`).toBeGreaterThan(50);
  });

  const subjects = posts.filter((p) => CLAIMS_SCHEMA_FROM_NAME.test(readPost(p)));

  it("the claim matcher still selects the posts that make the claim", () => {
    // The other half of the anti-vacuity pair. A matcher that has stopped matching produces
    // an empty `it.each`, and an empty `it.each` is indistinguishable from a clean corpus.
    expect(
      subjects.length,
      "the schema-claim matcher selected NO post. Either every post stopped explaining " +
        "where data lands — unlikely — or the matcher is broken. A zero here is a reading " +
        "about the pattern until you have seen it select something.",
    ).toBeGreaterThan(0);
  });

  it.each(subjects)("%s says HOW the schema is derived, not merely that it is", (post) => {
    for (const para of claimParagraphs(readPost(post))) {
      expect(
        STATES_TRANSFORM(para),
        `${post} ties the destination schema to the upload's name without stating the ` +
          `transform. Core folds whitespace runs to single underscores and lower-cases the ` +
          `result (to_snake_case), so \`Sheets Daily Sync\` lands in \`sheets_daily_sync\` — ` +
          `and the upload-name field accepts spaces, so that is a name readers really type. ` +
          `The paragraph must say both. landing#724.\n\n${para.slice(0, 220)}`,
      ).toBe(true);
    }
  });

  it("the matcher fires on the loose form and spares the precise one", () => {
    // Both halves in one test, per WORKFLOW_RULES §4: a control that only ever passes on the
    // corrected shape cannot tell you the pre-fix shape would have failed.
    const loose = [
      "The tables land in a schema **named after the upload**, so `airtabledailysync` creates schema `airtabledailysync`.",
      "It lands them in a PostgreSQL schema named after the upload, here `onlinestoresync`, next to three bookkeeping tables of dlt's own.",
      "Tables land in a schema **named after the upload**: an upload called `zendeskdailysync` creates the schema `zendeskdailysync`.",
    ];
    for (const sample of loose) {
      expect(
        CLAIMS_SCHEMA_FROM_NAME.test(sample),
        `the matcher missed a loose claim: ${sample.slice(0, 80)}`,
      ).toBe(true);
      expect(
        STATES_TRANSFORM(sample),
        `a loose claim scored as stating the transform: ${sample.slice(0, 80)}`,
      ).toBe(false);
    }

    const precise =
      "Your tables land in a schema **derived from the upload's name**: whitespace runs " +
      "become single underscores and the whole thing is lower-cased, so `Sheets Daily Sync` " +
      "creates schema `sheets_daily_sync`.";
    expect(CLAIMS_SCHEMA_FROM_NAME.test(precise), "the matcher stopped selecting the corrected form — it would then guard nothing after the fix").toBe(true);
    expect(STATES_TRANSFORM(precise), "the corrected form does not satisfy the requirement").toBe(true);

    // Unrelated uses of the word "schema" must NOT be selected, or the guard fails the build
    // on copy that has nothing to do with upload naming.
    const unrelated = [
      "Replace `main.raw_data` with your catalog.schema.",
      "- **Source schema** *(optional)* — the schema to read from on the source side.",
      "GRANT USAGE ON SCHEMA raw_data TO datanika_loader;",
      "declares all of them as dbt sources, under a source named after the upload's schema.",
    ];
    for (const sample of unrelated) {
      expect(
        CLAIMS_SCHEMA_FROM_NAME.test(sample),
        `the matcher fires on unrelated schema copy: ${sample.slice(0, 80)}`,
      ).toBe(false);
    }
  });
});
