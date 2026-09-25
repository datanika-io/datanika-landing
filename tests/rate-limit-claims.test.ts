import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
// ⚠️ `join` is ALIASED on purpose. The `pacing rule` describe block below declares its own
// `join` (an array-of-lines flattener), which shadows a bare `import { join }` inside that
// block — the directory walk then calls the flattener on a string and dies with
// `ls.join is not a function`. Measured, not guessed at: it is how this widening first ran.
import { join as pathJoin, relative, resolve, sep } from "path";
import { connectors } from "../src/data/connectors";

/**
 * Every place we publish an API rate limit must publish the same one, and must
 * not publish a dimension the product does not have.
 *
 * ## Why this exists
 *
 * `plans.rate_limit_rpm` (Free 30 / Pro 120 / Enterprise 300) was set by core
 * migration `r7n4o5p6q8k9` on **2026-04-09**, published here on **2026-04-10**,
 * and then never enforced — `set_api_rate_limit` early-returned on a missing
 * subscription, so every org ran at core's default 60 instead (cloud#107).
 * cloud#114 makes it real. The number therefore starts binding users in 2026
 * having been chosen in April by a migration with no linked issue, six days
 * before the pricing pivot that then never mentioned it:
 * `plans/growth/SPEC_PRICING_V2.md` does not contain the string `rate_limit`.
 *
 * While checking that, three published claims turned out to be false about the
 * mechanism rather than about the number — see landing#366 and core#703:
 *
 *   1. a per-plan **burst** column (Free 5/s, Pro 15/s, Enterprise 30/s). There
 *      is no burst column on `Plan`. `api_middleware.py` passes
 *      `burst_per_sec=settings.api_rate_limit_burst` at both call sites — one
 *      core setting, identical on every plan. The cloud hook mutates
 *      `context["limit_rpm"]` only, and `get_limit_for_org` returns a single
 *      `int`, so a per-plan burst cannot travel through it even in principle.
 *      Free's published 5/s was stricter than reality; **Pro's 15/s and
 *      Enterprise's 30/s were over-promises on the paid tiers.**
 *   2. "sliding window". `RateLimitService.check_window` keys on
 *      `now // window_seconds` — a fixed-window counter. Core's own class
 *      docstring says sliding; our copy inherited the word.
 *   3. a 429 example showing `X-RateLimit-Limit: 60`, which is the *self-hosted*
 *      default and is emitted by no cloud plan.
 *
 * Four hand-maintained copies of one number with nothing linking them: the same
 * shape as the MongoDB `auth_source` phantom and the SaaS endpoint lists.
 *
 * ## 🚨 What this test CANNOT do
 *
 * **It cannot see the database.** `RPM` below is a dated snapshot of the `plans`
 * rows. Plan rows get reseeded — the 2026-04-20 V2 reseed silently wiped a
 * deliberate `load-test` rpm override (`plans/infra/LOAD_TEST_BASELINE_2026-04-22.md`)
 * — and a reseed that misses `rate_limit_rpm` returns Free to the column default
 * 60 while every page here keeps saying 30, green. It closes drift *between our
 * own surfaces*, which is the channel that actually failed.
 *
 * It also cannot tell you whether 30 is the *right* number. That is an open
 * pricing decision (SPEC_PRICING_V2 §2.5); this file only holds the pages to
 * whatever the answer is.
 *
 * Re-derive rather than trusting this file:
 *
 *   gh api "repos/datanika-io/datanika-core/contents/datanika/migrations/versions/r7n4o5p6q8k9_add_rate_limit_rpm_to_plans.py?ref=master" \
 *     -H "Accept: application/vnd.github.raw"
 *   # and, for what production actually holds (Infra):
 *   #   SELECT slug, rate_limit_rpm, max_parallel_runs FROM plans ORDER BY id;
 */

/**
 * What we publish as the per-minute API limit.
 *
 * 🆕 **No longer only a snapshot (landing#531, 2026-09-07).** This was described as
 * *"read off production in core#699, 2026-08-30"* and closed drift between our own
 * pages only — a core reseed that missed the column would have returned Free to the
 * column default of 60 while every page kept saying 30, green.
 *
 * `.github/workflows/rate-limit-parity.yml` now binds this map to core's
 * `PUBLISHED_RATE_LIMIT_RPM` (migration `g7h8i9j0k1l2`) on a daily cron. Change a
 * number here and that job files an issue unless core moved too.
 *
 * ⚠️ **The binding is to core's DECLARED INTENT, not to the database.** Neither this
 * file nor that job can see the `plans` table. See the workflow's own header.
 */
const RPM = { Free: 30, Pro: 120, Enterprise: 300 } as const;

/**
 * What we publish as the concurrent-run ceiling — `/docs/scheduling-guide` sells
 * *"On the Free plan the ceiling is 2 concurrent runs; paid plans are higher."*
 *
 * Bound to core's `PUBLISHED_MAX_PARALLEL_RUNS` (migration `f6a7b8c9d0e1`) by the same
 * job. Added here rather than beside the prose so the parity checker has one landing-side
 * source to read, mirroring `PRODUCT` in `byte-pricing-surface-inventory.test.ts`.
 *
 * ⚠️ **`tests/scheduling-guide.test.ts` hard-codes `2` and `5` against the rendered page**
 * and does not read this constant. That is a second copy, recorded rather than silently
 * tolerated: it pins the *page* to a number, this pins the *number* to core, and the two
 * meet only if both are maintained. Collapsing them is worth doing and is not this change.
 */
const PARALLEL = { Free: 2, Pro: 5, Enterprise: 20 } as const;

/** `settings.api_rate_limit_rpm` — what a self-hosted instance gets. */
const SELF_HOSTED_RPM = 60;

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const REFERENCE = "src/pages/api/reference.astro";
const KEYS = "src/pages/api/keys.astro";
const AI_AGENTS = "src/pages/docs/ai-agents.astro";
const ARCHITECTURE = "src/pages/docs/architecture.astro";
const ANNOUNCE_POST = "src/content/blog/datanika-rest-api-v1.md";

/**
 * All five. `/api/keys` was very nearly left out of this list: a grep for
 * "rate limit" on that page returns its prose and its pointer to the reference,
 * and reading only those lines gives the false impression that it carries no
 * numbers. It carries the full table. **Grep for the number, not for the topic** —
 * the first draft of this file asserted `/api/keys` must NOT restate the tiers,
 * and that assertion is what found the fifth copy.
 */
const SURFACES = [REFERENCE, KEYS, AI_AGENTS, ARCHITECTURE, ANNOUNCE_POST];

describe("published rate limits agree with each other", () => {
  it.each(SURFACES)("%s names every tier's rpm, and no other rpm", (path) => {
    const text = src(path);

    // Each tier's number must appear adjacent to its plan name. The two table
    // shapes (`<td>Free</td><td>30</td>`, `| Free | 30 |`) and the architecture
    // prose (`Free 30rpm`) all satisfy this once tags and pipes are stripped.
    const flat = text.replace(/<[^>]+>/g, " ").replace(/\|/g, " ").replace(/\s+/g, " ");
    for (const [tier, rpm] of Object.entries(RPM)) {
      // Trailing `(?![0-9])` rather than `\b`: the architecture page writes
      // "Free 30rpm", and `\b30\b` does not match inside `30rpm`.
      expect(
        flat,
        `${path} must state ${tier} = ${rpm} rpm next to the tier name`,
      ).toMatch(new RegExp(`\\b${tier}\\b[^A-Za-z0-9]{0,40}${rpm}(?![0-9])`));
    }
  });

  it.each(SURFACES)("%s does not publish a per-plan burst column", (path) => {
    const text = src(path);

    // `Plan` has no burst column, so no page may present burst as a per-tier
    // number. Mentioning that a burst ceiling exists is fine and true; giving it
    // a column beside the tiers is not.
    expect(text, `${path} still has a per-tier burst column header`).not.toMatch(
      /burst\s*[/(]\s*(per\s*)?sec/i,
    );

    // The three fabricated values, in any table-cell or table-row form.
    for (const bad of ["5", "15", "30"]) {
      expect(
        text,
        `${path} still pairs a tier with a burst-per-second value`,
      ).not.toMatch(new RegExp(`<td>(30|120|300)</td>\\s*<td>${bad}</td>`));
    }
    expect(text).not.toMatch(/\|\s*(30|120|300)\s*\|\s*(5|15|30)\s*\|/);
  });

  it.each(SURFACES)("%s does not call the window sliding", (path) => {
    expect(src(path), `${path} describes the limiter as a sliding window`).not.toMatch(
      /sliding[\s-]*window/i,
    );
  });

  it.each(SURFACES)("%s does not call a limit generous", (path) => {
    // SPEC_PRICING_V2 §4.3 bans "generous" about a limit by name. It was on the
    // announcement post, describing a limit half the size of what we served.
    expect(src(path), `${path} calls a limit generous`).not.toMatch(/generous/i);
  });
});

describe("the self-hosted default is not presented as a cloud number", () => {
  it("the API reference's 429 example uses a real plan limit", () => {
    const text = src(REFERENCE);
    const example = text.slice(text.indexOf("429 Too Many Requests"));
    expect(example, "the 429 example shows the self-hosted 60, which no cloud plan emits").not.toMatch(
      new RegExp(`X-RateLimit-Limit:\\s*${SELF_HOSTED_RPM}\\b`),
    );
    expect(example).toMatch(
      new RegExp(`X-RateLimit-Limit:\\s*(${Object.values(RPM).join("|")})\\b`),
    );
  });

  it("the API reference still states the self-hosted default, labelled as such", () => {
    expect(src(REFERENCE)).toMatch(
      new RegExp(`[Ss]elf-hosted[^.]*${SELF_HOSTED_RPM}\\s*requests`),
    );
  });
});

describe("the limit is described as per-key, because that is what it is", () => {
  // `api_middleware.py` calls `check_rate_limit(bucket=f"{api_key.id}", …)`.
  // Per key, not per org — so two keys are two budgets, and nothing quotas the
  // number of keys an org may create (core#703 §4).
  it.each([REFERENCE, ANNOUNCE_POST])("%s says per key, not per organization", (path) => {
    expect(src(path)).toMatch(/per[\s-]key|per API key/i);
  });
});

/**
 * ## The pacing claims (landing#366 / core#705, 2026-08-31)
 *
 * The four claims above were settled by DELETING the false per-plan burst
 * column. What replaced it was silence, and the silence was the misleading
 * part. QA's probe (`plans/qa/notes/probe-705/`) issued each tier's entire
 * published minute allowance and found that **not one rejection at any tier
 * came from the per-minute limit** — every one came from the per-second
 * ceiling, always at request 11.
 *
 * The ceiling is uniform (`settings.api_rate_limit_burst`, measured at 10 on
 * both prod and staging) while the per-minute allowance is tiered, so burst
 * headroom relative to what a customer pays SHRINKS as they upgrade — 20x on
 * Free, 5x on Pro, 2x on Enterprise. An Enterprise key fanning out across
 * workers is throttled at roughly 7% of what it bought, and before this change
 * the page gave it no number to pace to.
 *
 * The page now publishes the pacing RULE and deliberately not the ceiling.
 * These assertions pin both halves.
 *
 * ## The asymmetry below is deliberate
 *
 * "Must state X" is checked as an exact computed substring; "must NOT print X"
 * is checked with a broad pattern. That is the right way round. A rephrase of
 * something we require fails loudly and the author updates this file. A
 * rephrase of something we ban escapes silently — which is exactly how
 * `overage-unit-claims.test.ts`, written for `/terms`, still missed
 * `model run overages`: it banned "overage per run", and the real text was
 * neither. A phrasing-specific ban is not a ban.
 */
describe("the pacing rule is published, and the ceiling is not", () => {
  /** 60 / rpm — seconds between requests, derived, never restated. */
  const SPACING = Object.fromEntries(
    Object.entries(RPM).map(([tier, rpm]) => [tier, 60 / rpm]),
  ) as Record<keyof typeof RPM, number>;

  const NL = String.fromCharCode(10);
  const lines = (path: string) => src(path).split(NL);
  const join = (ls: string[]) => {
    let t = ls.join(" ").replace(/<[^>]+>/g, " ");
    for (const c of [13, 9]) t = t.split(String.fromCharCode(c)).join(" ");
    return t.replace(/ +/g, " ");
  };
  const flatten = (path: string) => join(lines(path));

  /**
   * Markdown blockquotes are dropped first, because the announcement post's
   * dated correction note legitimately QUOTES the retired 5 / 15 / 30 figures
   * in order to say they were wrong. Deleting history is not honesty. The
   * carve-out is held shut by the assertion two tests below.
   */
  const isQuote = (l: string) => l.trimStart().startsWith(">");
  const currentClaims = (path: string) => join(lines(path).filter((l) => !isQuote(l)));
  const quotedOnly = (path: string) => join(lines(path).filter(isQuote));

  it("the API reference states the rule as a formula, not as three magic numbers", () => {
    expect(
      flatten(REFERENCE),
      "the reference must carry a `60 / (requests per minute)` formula",
    ).toMatch(/60 (&divide;|[/]|÷) [(]?(your plan[^ ]s )?requests per minute/i);
  });

  it.each(Object.entries(SPACING))(
    "the reference's %s spacing agrees with that tier's rpm (60/rpm = %ss)",
    (tier, seconds) => {
      // Parity, not existence: edit RPM and this recomputes, so a stale number
      // that is merely "present" fails instead of quietly passing.
      expect(
        flatten(REFERENCE),
        `the reference must say "${seconds}s on ${tier}" (60 / ${RPM[tier as keyof typeof RPM]})`,
      ).toContain(`${seconds}s on ${tier}`);
    },
  );

  /**
   * Any digit attached to the per-second concept, in either direction and in
   * every word we use for it. `[^.]` keeps a match inside one sentence.
   */
  const CEILING =
    "(per-second (ceiling|limit)|burst (ceiling|limit)|requests? per second|req[/]s)";
  const printsCeilingValue = (text: string) =>
    new RegExp(CEILING + "[^.]{0,30}[0-9]", "i").test(text) ||
    new RegExp("[0-9][^.]{0,30}" + CEILING, "i").test(text);

  /**
   * ## 🆕 A GUARD'S PATH SET IS ITS SCOPE, and this one's was FIVE FILES OUT OF 372
   *
   * (landing#712's round, 2026-09-25, Growth; scope independently confirmed by Infra.)
   *
   * `printsCeilingValue` reads like a site-wide ban on publishing a per-second rate
   * figure. It was applied to `SURFACES` — the five API pages — so a `~50 req/s` or a
   * `60 req/s` figure on `/pricing`, a comparison page, a connector guide or a new blog
   * post was **unwatched**. That is why the API pages are clean; it was never why the
   * site was. The ≥60 sweep that established the site-wide count cost **107 citations
   * across eight populations** to do by hand
   * (`plans/growth/notes/REQ_PER_S_PUBLIC_SURFACE_SWEEP_2026-09-25.md`), and a hand sweep
   * is not a mechanism: it answers for the day it ran.
   *
   * 🔑 **Widened now precisely BECAUSE nothing public carries a rate figure today.** A
   * guard that goes green on arrival cannot be argued down by whoever has to fix the red,
   * and there is nothing to negotiate. Waiting until something does carry one is waiting
   * until widening has a cost.
   *
   * ⚠️ **One ban, not two.** The predicate above is untouched; only the population under
   * it grew. What is new is that the two legitimate ways to carry a per-second figure are
   * now asserted as the PRESENCE of the thing that makes them legitimate
   * (WORKFLOW_RULES §4) rather than left as paths the ban happens not to reach:
   *
   *   1. **attributed to a named third party** — the sentence says whose limit it is,
   *   2. **quoted inside a dated correction** — the blockquote carve-out, unchanged.
   *
   * And a figure that really is ours may be published only in the one form the founder
   * ruled on 2026-09-25 (*"публикуем измеренные ~50 и перестаём ссылаться на 60"*):
   * **a floor of ~N req/s under neighbour load, measured on a stated date.** Never
   * *"Datanika handles N req/s"* — prod, staging, the co-tenants and the load generator
   * share one 4 vCPU box, so a capacity reading does not exist to be published.
   */
  /**
   * Every TEXT file under the two published roots. Measured 2026-09-25 rather than
   * assumed: `git ls-files -- src public` is **296** files, of which **222** match the
   * extensions below and the remaining **74 are binary** — 68 PNG, 5 fonts, 1 ico. So
   * this population is not a selection of the published tree, it is all of it that can
   * be read as text.
   *
   * ⚠️ The 74 binaries are a real blind spot and are recorded as one, not inferred
   * clean: raster text is not greppable and nobody has read the pixels
   * (`plans/growth/notes/REQ_PER_S_PUBLIC_SURFACE_SWEEP_2026-09-25.md`, population 1
   * of "could NOT search"). OG images are generated from page titles, which ARE in here.
   */
  const PUBLISHED_ROOTS = ["src", "public"] as const;
  const PUBLISHED_EXT = /\.(astro|md|mdx|ts|tsx|json|html|txt|svg|css)$/i;
  const SKIP_DIR = new Set(["node_modules", ".git", "dist", ".astro", "_archive"]);

  const publishedSurfaces = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIR.has(entry)) continue;
        const abs = pathJoin(dir, entry);
        if (statSync(abs).isDirectory()) walk(abs);
        else if (PUBLISHED_EXT.test(entry)) out.push(relative(process.cwd(), abs).split(sep).join("/"));
      }
    };
    for (const root of PUBLISHED_ROOTS) walk(resolve(process.cwd(), root));
    return out.sort();
  };

  /**
   * `connectors.ts` entries that name a FORMAT or a PROTOCOL rather than a company.
   *
   * 🚨 `REST API` is the one that matters and the reason this subtraction exists: **our
   * own API is a REST API**, so leaving it in the vendor set would exempt "the REST API
   * allows 60 requests per second" — the exact sentence this ban is for. Pinned by a
   * control in the table below, because a subtraction nobody exercises is a subtraction
   * somebody will undo.
   */
  const NOT_A_VENDOR = new Set(["REST API", "OpenAPI", "CSV", "JSON", "Parquet"]);

  /**
   * Third parties whose own rate limits we legitimately publish — Airtable's 5/s and
   * Notion's 3/s are real, correct, and on connector pages and a blog post today.
   *
   * Derived from `src/data/connectors.ts`, never hand-typed: the expected value has to
   * come from something this change cannot move, and a list maintained inside this file
   * goes stale the first time a connector lands (WORKFLOW_RULES §4, third door).
   */
  const THIRD_PARTIES = connectors
    .map((c) => c.name)
    .filter((n) => !NOT_A_VENDOR.has(n));

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /**
   * Attribution is adjacency, not co-occurrence: `<Vendor> … enforces`, within one
   * clause. Deliberately NOT "the sentence mentions a vendor and does not mention us" —
   * that form reds on the correct sentence "Airtable enforces 5 requests per second, so
   * we pace the extractor", and a guard that reds on correct copy gets deleted (§5a).
   */
  const ATTRIBUTES = /(enforces|limits|caps|allows|permits|throttles|restricts|imposes|rate[- ]limits)/;
  const attributedToThirdParty = (sentence: string) =>
    THIRD_PARTIES.some((v) =>
      new RegExp(`\\b${escapeRe(v)}\\b[^,;]{0,40}?\\b${ATTRIBUTES.source}\\b`, "i").test(sentence),
    );

  /** The only shape in which a per-second figure of OURS may be published. */
  const permittedOwnForm = (sentence: string) =>
    /\bfloor\b/i.test(sentence) &&
    /under neighbour load/i.test(sentence) &&
    /measured 20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/i.test(sentence);

  type Verdict = "clean" | "attributed" | "permitted-form" | "violation";
  const classify = (sentence: string): Verdict =>
    !printsCeilingValue(sentence)
      ? "clean"
      : attributedToThirdParty(sentence)
        ? "attributed"
        : permittedOwnForm(sentence)
          ? "permitted-form"
          : "violation";

  /**
   * `[^.]` in CEILING already forbids a match crossing a sentence boundary, so splitting
   * on `.` after the same flatten the narrow test used is equivalent at file level — and
   * it is the granularity an exemption has to be decided at. Blockquotes are dropped
   * first, so the dated-correction carve-out survives the widening intact.
   */
  const claimSentences = (path: string) =>
    currentClaims(path)
      .split(".")
      .map((s) => s.trim())
      .filter(Boolean);

  /**
   * 🔑 Nine controls, driven through the SAME classifier in the SAME run. A sweep that
   * finds nothing over 300 files and a sweep whose classifier is broken print the same
   * thing, and this table is the only difference between them.
   */
  const CONTROLS: Array<{ text: string; verdict: Verdict; why: string }> = [
    { text: "Datanika sustains 60 req/s under neighbour load", verdict: "violation",
      why: "the capacity claim the founder's ruling forbids outright" },
    { text: "our API allows 10 requests per second", verdict: "violation",
      why: "the per-second ceiling is an operational env var, not a published promise" },
    { text: "the per-second ceiling is 10", verdict: "violation",
      why: "naming the ceiling at all, in the words the page itself uses" },
    { text: "the REST API allows 60 requests per second", verdict: "violation",
      why: "NOT_A_VENDOR must keep our own API out of the attribution exemption" },
    { text: "Airtable enforces 5 requests per second per base", verdict: "attributed",
      why: "a third party's own limit, attributed in the copy — live on two pages today" },
    { text: "Notion enforces 3 requests per second per integration", verdict: "attributed",
      why: "the same, and the reason a bare widening would have gone red on arrival" },
    { text: "Airtable enforces 5 requests per second per base, so we pace the extractor",
      verdict: "attributed",
      why: "attribution plus a first-person clause is still attribution — the false red this avoids" },
    { text: "a floor of ~50 req/s under neighbour load, measured 2026-09-24", verdict: "permitted-form",
      why: "the one permitted form, whole" },
    { text: "a floor of ~50 req/s under neighbour load", verdict: "violation",
      why: "the permitted form minus its date is an unsourced claim, and must not pass" },
    { text: "the window is fixed and resets every minute", verdict: "clean",
      why: "no figure next to a per-second unit: the ban must not fire on prose about the limiter" },
  ];

  it.each(CONTROLS)("control: $text -> $verdict", ({ text, verdict, why }) => {
    expect(classify(text), why).toBe(verdict);
  });

  it("the swept population is the published tree, not a handful of pages", () => {
    const files = publishedSurfaces();

    // 🚨 Anti-vacuity: a walk that returns nothing reports the whole site clean, which is
    // the exact failure this widening removes, and it must not be able to arrive twice by
    // a different route.
    //
    // ⚠️ The floor is deliberately FAR below today's count (222 text files at
    // 2026-09-25) and is NOT a snapshot of it. Pinning the real number would make this
    // assertion fail every time a blog post ships — "assert the invariant, not today's
    // instance" (WORKFLOW_RULES §5a), and a guard that reds on routine correct work is a
    // guard someone deletes. What it catches is an empty walk or one that reached a
    // single directory.
    expect(files.length, "the published-surface walk found almost nothing").toBeGreaterThan(100);

    // Both roots, so a walk that silently reached only one of them fails. `public/` holds
    // the 36 connector guides; `src/` holds the pages, the blog and the data modules.
    expect(files.some((f) => f.startsWith("src/")), "the walk never reached src/").toBe(true);
    expect(files.some((f) => f.startsWith("public/")), "the walk never reached public/").toBe(true);

    // The five files this ban used to cover must still be inside the wider population —
    // widening a path set is worthless if it drops what it started with.
    for (const s of SURFACES) {
      expect(files, `${s} must still be inside the population this ban sweeps`).toContain(s);
    }

    // Derived coverage rather than a count: every connector we publish has a content page,
    // and that set grows from connectors.ts, so this scales with the site instead of
    // freezing a number. Connector pages are where third-party rate limits actually live.
    for (const c of connectors) {
      expect(
        files,
        `src/content/connectors/${c.slug}.md is published but outside the swept population`,
      ).toContain(`src/content/connectors/${c.slug}.md`);
    }
  });

  it("no published surface prints a per-second figure as ours", () => {
    const violations: string[] = [];
    let attributed = 0;
    for (const path of publishedSurfaces()) {
      for (const sentence of claimSentences(path)) {
        const verdict = classify(sentence);
        if (verdict === "attributed" || verdict === "permitted-form") attributed++;
        if (verdict === "violation") violations.push(`${path}: "${sentence.slice(0, 160)}"`);
      }
    }
    expect(
      violations,
      "A per-second rate figure is published as ours. There are exactly three ways this " +
        "passes: attribute it to the third party whose limit it is, quote it inside a dated " +
        "`> **Corrected YYYY-MM-DD**` note, or — if it really is ours — publish the founder's " +
        "form: a floor of ~N req/s under neighbour load, measured on a stated date. " +
        "Never a capacity figure: prod, staging, the co-tenants and the generator share one " +
        "4 vCPU box.\n" +
        violations.join("\n"),
    ).toEqual([]);
    // The sweep must be looking at something. Three attributed third-party figures are
    // live today; zero would mean the walk or the classifier stopped seeing them.
    expect(attributed, "the sweep found no legitimate figure either — check the walk").toBeGreaterThan(0);
  });

  it("the announcement post's retired burst figures survive ONLY inside a dated correction", () => {
    // Proves the blockquote carve-out is not a hole. If a ceiling figure ever
    // appears outside a correction note on that page, the middle line fails.
    expect(
      printsCeilingValue(flatten(ANNOUNCE_POST)),
      "precondition: the post is supposed to still quote the retired 5 / 15 / 30",
    ).toBe(true);
    expect(printsCeilingValue(currentClaims(ANNOUNCE_POST))).toBe(false);
    expect(
      quotedOnly(ANNOUNCE_POST),
      "a correction note must be dated, or it is just an unsourced claim",
    ).toMatch(/Corrected 20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/);
  });

  it("the reference says the ceiling does not scale with the plan", () => {
    // This is WHY pacing is needed; without it the rule reads as arbitrary.
    expect(src(REFERENCE)).toMatch(
      /same on every plan|not a tier dimension|does not (grow|rise) when|identical on every plan/i,
    );
  });

  it("the reference warns that a per-second 429 reports the per-minute allowance", () => {
    // `check_window` returns `limit=limit_rpm` with `retry_after=1` on a burst
    // rejection, so the response names a number the caller never reached. It is
    // the most confusing thing about our 429 and must stay documented.
    const text = flatten(REFERENCE);
    expect(text, "Retry-After: 1 must be named as the discriminator").toMatch(/Retry-After: 1/);
    expect(
      text,
      "the reference must say the per-minute allowance is reported even on a per-second rejection",
    ).toMatch(/including a per-second rejection|not the limit that rejected/i);
  });

  it("the agent docs send readers to a pacing section that exists", () => {
    // Verified by reading the linked file, not by trusting the href — the same
    // discipline as the CI/CD post's link check below.
    expect(src(AI_AGENTS), `${AI_AGENTS} must link agents to the pacing rule`).toContain(
      "/api/reference#pacing",
    );
    expect(
      src(REFERENCE),
      `${REFERENCE} must define id="pacing" — a link is not a destination`,
    ).toContain('id="pacing"');
  });

  it("the agent docs name the fan-out failure mode, since agents fan out", () => {
    expect(src(AI_AGENTS)).toMatch(/parallel|fan out|worker/i);
  });
});

describe("the CI/CD post's rate-limit section points somewhere that answers it", () => {
  const POST = "src/content/blog/trigger-pipelines-from-ci-cd.md";

  it("links to a surface that actually carries the per-plan numbers", () => {
    const text = src(POST);
    const claim = text.slice(text.indexOf("## Rate limits"));
    const targets = [
      { href: "/api/reference#rate-limits", file: REFERENCE },
      { href: "/api/keys", file: KEYS },
    ];
    const linked = targets.filter((t) => claim.includes(t.href));
    expect(linked.length, "the post promises 'current per-plan limits' behind a link").toBeGreaterThan(0);

    // Whichever it points at must state the numbers — the promise is the numbers,
    // not the topic.
    for (const t of linked) {
      expect(src(t.file), `${t.href} must carry the tier numbers the post promises`).toMatch(
        new RegExp(`${RPM.Free}[\\s\\S]{0,400}${RPM.Enterprise}`),
      );
    }
  });

  it("does not tell readers that ?wait=true costs a request per poll", () => {
    // `?wait=true` polls server-side: one request against the caller's budget for
    // the whole wait, not one per 2-second poll. A CI post that implied otherwise
    // would push people onto the loop that does cost per iteration.
    const text = src(POST);
    expect(text).toMatch(/polls \*\*server-side\*\*|server-side/);
  });
});

/**
 * `PARALLEL` exists so the cross-repo parity job has one landing-side source to read
 * (landing#531). A constant nothing asserts is a value nobody checks, so it is bound to
 * the page here as well as to core there.
 */
/**
 * core#706: the limit is enforced **per API key** while the tier table reads like an
 * organization allowance, and `plans.max_api_keys` is NULL on every row — so the
 * published figure is a per-key *rate*, not a ceiling.
 *
 * 🔑 **The exposure is one-directional and that is why it needed copy rather than a
 * decision.** A reader can only be misled *upward*: told the limit is per key, told
 * nothing about how many keys exist, and left to assume a cap that is not there. Nobody
 * gets less than we publish; someone builds on more than we meant, and it surfaces in
 * their integration rather than in our inbox.
 *
 * Asserted as **presence of the qualification**, never as absence of a word — a ban is
 * satisfied by the sentence that denies it (WORKFLOW_RULES §4).
 */
describe("the per-key limit is published as a rate, not as a ceiling (core#706)", () => {
  const REF_PAGE = "src/pages/api/reference.astro";

  it("the reference states that key count is not currently capped", () => {
    const text = src(REF_PAGE);
    expect(
      text,
      `${REF_PAGE} says the limit is per key. It must also say we do not currently cap how ` +
        "many keys an org may create — otherwise a reader infers an organization ceiling " +
        "that does not exist. SPEC_PRICING_V2 §2.5, 'The contract we publish today', item 4.",
    ).toMatch(/do not currently cap how many keys/i);
  });

  it("it frames the figure as a per-key rate rather than an org-wide ceiling", () => {
    // The qualification is only useful if the reader is told what it means for the
    // number above it. Pinning the consequence, not just the disclosure.
    expect(src(REF_PAGE)).toMatch(/per-key rate rather than an organization-wide ceiling/i);
  });

  it("does not promise unlimited keys", () => {
    // ⚠️ The one place an absence assertion is right, and it is narrow: "unlimited" is a
    // commitment we would have to retract if D-RL4 lands on a per-tier max_api_keys,
    // whereas "do not currently cap" is a description that would simply be replaced.
    // SPEC_PRICING_V2 §4.3 bans the word on metered dimensions for exactly this reason.
    expect(src(REF_PAGE)).not.toMatch(/unlimited (api )?keys/i);
  });
});

describe("the concurrency ceiling we publish matches the constant the parity job reads", () => {
  const GUIDE = "src/pages/docs/scheduling-guide.astro";

  it("the guide states the Free ceiling as PARALLEL.Free", () => {
    const text = src(GUIDE);
    // Bound to the constant, never to a literal: a guard that hard-codes the number it
    // is checking cannot notice the number changing.
    expect(
      text,
      `${GUIDE} must state the Free concurrency ceiling as ${PARALLEL.Free}, which is what ` +
        "core's PUBLISHED_MAX_PARALLEL_RUNS declares and what the parity job compares against.",
    // ⚠️ Written from the file's bytes, not from memory of the markup. The first
    // version put `</strong>` between the number and the words; the page has
    // `<strong>2 concurrent runs</strong>`, so the number and the words are adjacent
    // and the tag is outside both. Anchoring on prose you have retyped matches nothing.
    ).toMatch(new RegExp(`${PARALLEL.Free}(&nbsp;|\\s)+concurrent runs`));
  });

  it("the guide does not publish a paid-tier concurrency figure it cannot keep", () => {
    // Deliberately a *presence* assertion about the hedge rather than a ban on numbers:
    // the page says "paid plans are higher" instead of naming 5 and 20, so nothing there
    // can drift. If someone later names them, this fails and they must bind them to
    // PARALLEL.Pro / PARALLEL.Enterprise rather than typing them.
    const text = src(GUIDE);
    const namesPaidFigure =
      new RegExp(`${PARALLEL.Pro}\\s*(&nbsp;|\\s)?concurrent`).test(text) ||
      new RegExp(`${PARALLEL.Enterprise}\\s*(&nbsp;|\\s)?concurrent`).test(text);
    expect(
      namesPaidFigure,
      "the guide now names a paid-tier concurrency number. That is fine, but bind it to " +
        "PARALLEL.Pro / PARALLEL.Enterprise so the parity job covers it.",
    ).toBe(false);
  });
});
