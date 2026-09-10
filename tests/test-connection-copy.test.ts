/**
 * A connector guide must describe Test Connection the way the button behaves —
 * landing#502, contract in `docs/specs/SPEC_TEST_CONNECTION_GUIDE_COPY.md` §9.
 *
 * ## What this is for
 *
 * 22 guides quoted *"Test not applicable for this type"*, a message no code path
 * emits since core#821 — and for 18 of them the direction was the expensive one:
 * the page said a working button does not work. Product's copy fix landed in
 * `a4bac15a` **with no test**, so nothing stopped it coming straight back.
 *
 * This file is that guard. It implements the spec's G1-G7, and the two hardest
 * requirements in it are both about NOT doing the obvious thing.
 *
 * ## 🚨 Why a bare token ban is the wrong guard (spec §9)
 *
 * `count("Test not applicable for this type") === 0` would be wrong even with
 * every page fixed. Three legitimate occurrences exist and must keep existing:
 * `/blog/green-tests-broken-connectors/`'s historical account, two comments in
 * `connection_service.py`, and **the spec itself**, which has to quote the
 * wording it retires or a future reader cannot tell which phrase was retired.
 *
 * 🔑 **So a contradiction grep over that wording can never legitimately return 0,
 * and this guard asserts the SET, never the count.** The discriminator is the
 * *instruction shape* — a `Test Connection` mention within N characters of the
 * retired verdict, i.e. a page telling a reader to expect it — plus the document
 * role: the ban is scoped to `src/content/connectors/` and to the built connector
 * routes, so the blog's past-tense record is outside it by construction rather
 * than by an exemption someone could widen.
 *
 * ## 🚨 Why it reads the page's TEXT (spec G6)
 *
 * A multi-token literal split across `<em>`/`<code>`, or sitting inside a
 * highlighted fence, never matches the built page. That is measured, twice:
 * `kafka-auth-claims.test.ts` had a banned payload leave every `dist/`-side
 * assertion green, and landing#505 found two more guards blind to a violation
 * they catch in plain prose.
 *
 * ⚠️ **Deliberate divergence from G6's literal wording, stated rather than made
 * silently.** The spec suggests `html.replace(/<[^>]*>/g, " ")`. This uses
 * `inlineText()` from landing#505 instead, which strips **inline** tags only. The
 * blanket form glues `<td>Test Connection</td><td>Test not applicable…</td>` into
 * one phrase, and **every connector guide has a field table** — so the blanket
 * strip would manufacture violations here specifically. `inlineText` satisfies
 * G6's intent (match text, not markup) without that hazard, and carries its own
 * false-positive control.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { inlineText } from "./helpers/rendered-text";

const ROOT = resolve(__dirname, "..");
const GUIDES = resolve(ROOT, "src/content/connectors");
const DIST = resolve(ROOT, "dist");

/** The verdict core stopped emitting in core#821. */
const RETIRED = "Test not applicable for this type";

/**
 * G7 — group membership mirrors `datanika/services/connection_service.py`.
 *
 * The landing repo's CI checks out only this repo, so the lists cannot be
 * imported. They are re-derivable in one command, and the totals below are
 * asserted unconditionally so a divergence is loud rather than silent:
 *
 *   python -c "import ast,sys; t=ast.parse(open(sys.argv[1]).read()); ..."
 *   (full derivation: plans/qa/notes/sweep-505/probe_502_claims.py)
 */
const PROBE = [
  "airtable", "asana", "facebook-ads", "freshdesk", "github", "hubspot", "jira",
  "notion", "pipedrive", "salesforce", "shopify", "slack", "stripe", "zendesk",
];
/**
 * Every `SAAS_PROBE_EXEMPT` slug that has a published guide.
 *
 * 🚨 **This said "minus `openapi`, which has no page" and went stale the moment
 * `c6f3ed5` published one (landing#508).** The page shipped, made an exempt-type
 * claim, and was covered by nothing — because G7's membership check only catches
 * *named-but-absent*, never *present-but-unnamed*, so the one direction that
 * matters here was invisible. The list now names all six, and the assertion
 * below closes the direction that let it drift.
 */
const EXEMPT_WITH_PAGE = [
  "rest-api", "openapi", "google-ads", "google-analytics", "google-sheets", "kafka",
];
const FILE_TYPES = ["s3", "csv", "json", "parquet"];

/** Spec §3: `_NON_DB_TYPES` = 25 = 4 file + 14 probed + 6 exempt + 1 mongodb. */
const NON_DB_TOTAL = 25;
const EXEMPT_TOTAL = 6;

const guideText = (slug: string) =>
  readFileSync(resolve(GUIDES, `${slug}.md`), "utf-8");

/** The built route's text, as a reader receives it. */
function builtText(slug: string): string | null {
  const f = resolve(DIST, `docs/connectors/${slug}/index.html`);
  return existsSync(f) ? inlineText(readFileSync(f, "utf-8")) : null;
}

const allGuides = readdirSync(GUIDES)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));

describe("connector guides describe Test Connection as it behaves (#502, spec §9)", () => {
  it("the guide corpus is non-trivial (guards a dead walk)", () => {
    // A walk that finds nothing reports zero violations, which reads exactly like
    // a clean sweep.
    expect(allGuides.length, "no connector guides found under src/content/connectors").toBeGreaterThan(30);
  });

  it("G7 — the derived totals still partition exactly", () => {
    // If core adds a probe or an exemption, this arithmetic breaks before any
    // page-level assertion does, which is the loud failure G7 asks for.
    expect(
      FILE_TYPES.length + PROBE.length + EXEMPT_TOTAL + 1,
      `spec §3 pins _NON_DB_TYPES at ${NON_DB_TOTAL} = 4 file + 14 probed + 6 exempt + 1 mongodb. ` +
        "If this fails, connection_service.py moved and the group lists below are stale — " +
        "re-derive with plans/qa/notes/sweep-505/probe_502_claims.py rather than adjusting the total.",
    ).toBe(NON_DB_TOTAL);
    // Every slug named here must actually have a page, or the per-group
    // assertions below silently cover nothing.
    const missing = [...PROBE, ...EXEMPT_WITH_PAGE, ...FILE_TYPES].filter(
      (s) => !allGuides.includes(s),
    );
    expect(missing, `named in a group but has no guide: ${missing.join(", ")}`).toEqual([]);

    // 🚨 The OTHER direction, which is the one that actually drifted. The check
    // above catches *named-but-absent*. `openapi` was *present-but-unnamed*: its
    // guide shipped in c6f3ed5 (landing#508), made an exempt-type claim, and was
    // covered by nothing — while this file's comment still said it had no page.
    // Nothing failed, because no assertion looked this way.
    //
    // Keep the exempt roster whole by construction: every exempt slug is either
    // published (and therefore asserted below) or explicitly listed as unpublished.
    // A new exemption cannot be quietly half-covered.
    const EXEMPT_WITHOUT_PAGE: string[] = [];
    expect(
      EXEMPT_WITH_PAGE.length + EXEMPT_WITHOUT_PAGE.length,
      `the exempt roster must account for all ${EXEMPT_TOTAL} SAAS_PROBE_EXEMPT types. ` +
        "If core added one, put it in EXEMPT_WITH_PAGE (and write the page's copy) " +
        "or in EXEMPT_WITHOUT_PAGE with a reason — never leave it in neither.",
    ).toBe(EXEMPT_TOTAL);
    const unlistedExempt = EXEMPT_WITHOUT_PAGE.filter((s) => allGuides.includes(s));
    expect(
      unlistedExempt,
      `listed as unpublished but a guide now exists — move to EXEMPT_WITH_PAGE: ${unlistedExempt.join(", ")}`,
    ).toEqual([]);
  });

  it("G1 — no guide tells a reader to EXPECT the retired verdict", () => {
    // The instruction shape, not the bare token: a `Test Connection` mention
    // within 200 characters of the retired string, either side.
    const INSTRUCTION = new RegExp(
      `(?:Test Connection[\\s\\S]{0,200}${RETIRED}|${RETIRED}[\\s\\S]{0,200}Test Connection)`,
      "i",
    );
    const violations: string[] = [];
    for (const slug of allGuides) {
      if (INSTRUCTION.test(guideText(slug))) violations.push(`src/content/connectors/${slug}.md`);
      const built = builtText(slug);
      if (built && INSTRUCTION.test(built)) violations.push(`dist/docs/connectors/${slug}/`);
    }
    expect(
      violations,
      `These pages instruct the reader to expect "${RETIRED}", which no code path has emitted ` +
        "since core#821. For 18 of the 22 originally affected, the button does a real check and " +
        `the page says it does not.\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("G2 — no guide carries the deleted 'HTTP-API source' premise", () => {
    // Spec §2: the premise is false — 14 HTTP-API sources ARE probed. It is the
    // sentence that made the retired verdict sound reasonable, so leaving it
    // behind invites the verdict back.
    const PREMISE = /HTTP[- ]API source/i;
    const violations = allGuides.filter((s) => PREMISE.test(guideText(s)));
    expect(
      violations,
      "The 'it's an HTTP-API source' explanation is false — Stripe, GitHub, Slack and 11 others " +
        `are HTTP APIs and are probed for real.\n${violations.join(", ")}`,
    ).toEqual([]);
  });

  it("G3 — every exempt guide names the neutral verdict and claims no connectivity check", () => {
    const DENIES: string[] = [];
    const CLAIMS_CHECK = /Test Connection[^.]{0,120}(?:checks connectivity|verifies[^.]{0,40}credential|validates[^.]{0,40}credential|opens a connection)/i;
    for (const slug of EXEMPT_WITH_PAGE) {
      const md = guideText(slug);
      if (!/not tested/i.test(md)) DENIES.push(`${slug}: does not say "not tested"`);
      if (CLAIMS_CHECK.test(md)) DENIES.push(`${slug}: claims the button checks connectivity`);
    }
    expect(
      DENIES,
      "An exempt type returns (None, <reason>) — neither pass nor failure. A page claiming the " +
        "button checks connectivity is the defect that started this issue on the Kafka guide.\n" +
        DENIES.join("\n"),
    ).toEqual([]);
  });

  it("G4 — every probed guide claims a real check and denies none", () => {
    // The positive half, and it is not optional: deleting the sentence entirely
    // satisfies G1 while leaving the reader exactly as uninformed. An
    // absence-only guard cannot tell a correction from a deletion.
    const CLAIMS_REAL = /(?:real|actually|genuinely)[^.]{0,60}(?:check|probe|call)|(?:checks|verifies|validates)[^.]{0,60}(?:credential|token|key|API)|authenticated (?:GET|request|call)/i;
    const missing = PROBE.filter((s) => !CLAIMS_REAL.test(guideText(s)));
    expect(
      missing,
      "These pages no longer say Test Connection performs a real credential check. Deleting the " +
        "claim passes the ban above and leaves the reader believing nothing is verified — the " +
        `same failure in a quieter form.\n${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("§8.1 — the blog's historical account is untouched (false-positive control)", () => {
    // 🚨 The control this whole file is shaped around. `/blog/green-tests-broken-
    // connectors/` quotes the retired string in the PAST TENSE and is correct
    // copy. A guard that fires here is a ban that fires inside its own negation.
    const post = resolve(ROOT, "src/content/blog/green-tests-broken-connectors.md");
    expect(existsSync(post), "the blog post moved — re-point this control").toBe(true);
    const md = readFileSync(post, "utf-8");
    expect(
      md.includes(RETIRED),
      "the historical account no longer quotes the retired wording — if it was edited, that is " +
        "the thing spec §8.1 forbids, and this control is the only thing watching it",
    ).toBe(true);
    // And the ban must not reach it: it is not under src/content/connectors/.
    expect(allGuides).not.toContain("green-tests-broken-connectors");
  });

  it("AC9 — the retired wording still exists where it should, and is asserted as a SET", () => {
    // 🚨 This assertion was WRONG on its first draft and the arming harness
    // caught it — the most useful result of the whole run.
    //
    // It read `expect(guidesContainingTheString).toEqual([])`, i.e. **the bare
    // token ban the spec forbids, moved one directory over**. Mutation M7 — the
    // retired wording added to `notion.md` as an explicit historical note, far
    // from any Test Connection instruction — was declared GREEN and went RED
    // here. AC9's own text says *"it does not assert zero"*; my implementation
    // asserted zero.
    //
    // What AC9 actually contributes is the **positive** half below: the
    // legitimate occurrences must still exist. The harmful shape under
    // `src/content/connectors/` is already covered by G1, which bans the
    // *instruction* rather than the phrase — so re-banning the phrase here adds
    // nothing except the ability to fail on correct copy.
    //
    // The guide-side half is therefore DELETED rather than softened. Rewriting it
    // as `expect(Array.isArray(hits)).toBe(true)` to keep a line here would have
    // been worse than removing it: a tautology reads as coverage, and this file
    // exists to remove assertions that cannot fail.
    //
    // AC9's "count the hits and read each one" is a verification instruction for
    // a human, not an assertion. `plans/qa/notes/sweep-505/arm_502_guard.py`
    // records the count at the time of writing: 0 under the guides, 2 outside.
    const spec = resolve(ROOT, "docs/specs/SPEC_TEST_CONNECTION_GUIDE_COPY.md");
    const legitimate = [
      resolve(ROOT, "src/content/blog/green-tests-broken-connectors.md"),
      spec,
    ].filter((p) => existsSync(p) && readFileSync(p, "utf-8").includes(RETIRED));
    expect(
      legitimate.length,
      "Neither the blog's historical account nor the spec's own quotation of the wording it " +
        "retires still carries it. A retirement note that stops quoting the retired phrase " +
        "leaves a future reader unable to tell which phrase was retired.",
    ).toBe(2);
  });
});

/**
 * The three surfaces #502's sweep did not reach, all of them outside
 * `src/content/connectors/` and therefore outside every assertion above.
 *
 * 🔑 **The template is the one that matters**, and it is the reason the other 22
 * pages said the same wrong thing: `_template.md` *instructed* the retired
 * verdict in an affirmative sentence, so every guide written from it inherited
 * the defect. Fixing 22 outputs and leaving the generator is fixing the symptom
 * — the next connector would have arrived pre-broken, and a guard scoped to the
 * guides would have called it clean.
 */
describe("the surfaces outside the guide corpus (#502 residues)", () => {
  const TEMPLATE = resolve(ROOT, "src/pages/docs/connectors/_template.md");
  const CONNECTIONS = resolve(ROOT, "src/pages/docs/connections.astro");

  /**
   * 🚨 **This guard failed on its own fix, and the failure is the rule.** The
   * corrected template explains *why* the retired verdict is wrong, so it quotes
   * it — and a ban on "`Test Connection` near the retired string" is satisfied by
   * the sentence that retires it. WORKFLOW_RULES §4, exactly: *"any guard written
   * as 'the artifact must not contain X' is defeated by the corrected artifact
   * explaining why X is wrong."*
   *
   * So the ban applies to the **directive** an author copies, not to the HTML
   * comment block telling them not to. Same remedy as the workflow guards that
   * strip `#` comments before asserting on a command — and, as there, the
   * stripper needs a control, or a stripper that eats everything makes this pass
   * for the wrong reason.
   */
  const stripHtmlComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, " ");

  it("the comment stripper does not swallow the template", () => {
    const text = readFileSync(TEMPLATE, "utf-8");
    const stripped = stripHtmlComments(text);
    expect(
      stripped.length / text.length,
      "stripHtmlComments() removed most of _template.md — an assertion over an emptied " +
        "document passes for the wrong reason.",
    ).toBeGreaterThan(0.5);
    // And it must still remove a comment, or it is a no-op wearing a stripper's name.
    expect(stripHtmlComments("a <!-- gone --> b")).toBe("a   b");
  });

  it("the guide template does not instruct the retired verdict", () => {
    expect(existsSync(TEMPLATE), `${TEMPLATE} is gone — this guard now covers nothing`).toBe(true);
    const text = stripHtmlComments(readFileSync(TEMPLATE, "utf-8"));
    // The instruction shape, matching G1: an author-facing directive that puts
    // `Test Connection` and the retired string in the same breath.
    const INSTRUCTION = new RegExp(
      `(?:Test Connection[\\s\\S]{0,200}${RETIRED}|${RETIRED}[\\s\\S]{0,200}Test Connection)`,
      "i",
    );
    expect(
      INSTRUCTION.test(text),
      "src/pages/docs/connectors/_template.md tells the next author to write the retired " +
        "verdict. Every guide written from it inherits landing#502.",
    ).toBe(false);

    // Positive half: the template must still SAY something about the button, or
    // a future author simply omits it. Absence is not correctness here.
    expect(
      /Test Connection/i.test(text),
      "the template no longer mentions Test Connection at all — an author writing from it " +
        "will omit the behaviour rather than describe it.",
    ).toBe(true);
  });

  /**
   * 🚨 **The positive half above is satisfied by a line that has nothing to do
   * with the guidance, and that was MEASURED, not suspected.**
   *
   * Deleting the entire `TEST CONNECTION` comment block from `_template.md` — the
   * block that tells the next author to derive the answer from core rather than
   * copy a neighbour — leaves the whole suite green at 2249/2249. `/Test
   * Connection/` still matches, because step 4 of the template says *"Click **Test
   * Connection**, then **Create Connection**"*, and that line survives the
   * deletion untouched.
   *
   * So the guard catches the regression that HAPPENED (the template instructing
   * the retired verdict) and misses the regression that is now easiest to make:
   * the instruction quietly going away. An author then writes the sentence from
   * a neighbouring guide, which the deleted block exists to forbid — and which
   * is how the retired string reached 22 pages in the first place.
   *
   * ⚠️ **Asserted on the RAW file, deliberately.** The guidance lives inside an
   * HTML comment, so it is exactly what `stripHtmlComments()` removes. The ban
   * above reads the stripped text and this reads the raw text, and that
   * opposition is the point: the directive an author copies must not contain the
   * retired verdict, and the comment telling them what to write must exist.
   */
  it("the guide template still tells the next author HOW to derive the verdict", () => {
    const raw = readFileSync(TEMPLATE, "utf-8");

    const block = raw.match(/<!--[\s\S]*?TEST CONNECTION[\s\S]*?-->/);
    expect(
      block,
      "_template.md has lost its TEST CONNECTION guidance block. Nothing now tells the " +
        "next author which of the three behaviours applies, so they will copy a neighbouring " +
        "guide — the exact path that spread the retired verdict across 22 pages (landing#502).",
    ).not.toBeNull();

    const guidance = block![0];

    // Each needle is a distinct instruction, not a synonym of the others: where to
    // derive it, the three answers it can be, and the path that must not be taken.
    const REQUIRED: Array<[RegExp, string]> = [
      [/connection_service\.py/, "names the file the answer is derived FROM"],
      [/SAAS_PROBES/, "names the probing group"],
      [/_FILE_TYPES/, "names the file-listing group"],
      [/SAAS_PROBE_EXEMPT/, "names the exempt group"],
      [/neighbouring guide|neighboring guide/i, "forbids copying a neighbouring guide"],
    ];
    const missing = REQUIRED.filter(([re]) => !re.test(guidance)).map(([, why]) => why);
    expect(
      missing,
      "_template.md's guidance block no longer " + missing.join("; and no longer ") +
        ". Each of these is a separate instruction and the block is useless without all of them.",
    ).toEqual([]);
  });

  it("the shared Connections doc does not claim a blanket credential check", () => {
    const text = readFileSync(CONNECTIONS, "utf-8");
    // Six SAAS_PROBE_EXEMPT types return a neutral verdict, so an unqualified
    // "Test Connection verifies your credentials" is false for a quarter of the
    // catalogue. Require the qualification, not the absence of a phrase.
    expect(
      /not tested/i.test(text),
      "src/pages/docs/connections.astro describes Test Connection for ALL types, so it must " +
        `name the neutral verdict the ${EXEMPT_TOTAL} exempt types return.`,
    ).toBe(true);
  });

  /**
   * `public/` is copied verbatim into `dist/`, so these provenance notes are
   * served at `/docs/connectors/<slug>/README.md`. Several assert the retired
   * verdict in the **present tense** ("does return", "returns ... for HTTP-API
   * sources"), which is how a dated observation becomes a live false claim.
   *
   * They are date-framed rather than rewritten — the same call made on
   * `saas-12-euros` — so the assertion is that a file carrying the retired
   * string also carries the banner qualifying it. Banning the string outright
   * would destroy the record these files exist to hold.
   */
  it("every served provenance README quoting the retired verdict is date-framed", () => {
    const dir = resolve(ROOT, "public/docs/connectors");
    const slugs = readdirSync(dir).filter((s) =>
      existsSync(resolve(dir, s, "README.md")),
    );
    expect(slugs.length, "no provenance READMEs found — this guard walks nothing").toBeGreaterThan(10);

    const unframed = slugs.filter((s) => {
      const text = readFileSync(resolve(dir, s, "README.md"), "utf-8");
      return text.includes(RETIRED) && !/Superseded observation/i.test(text);
    });
    expect(
      unframed,
      "these are served at /docs/connectors/<slug>/README.md and state the retired verdict " +
        `with nothing dating it: ${unframed.join(", ")}`,
    ).toEqual([]);
  });
});
