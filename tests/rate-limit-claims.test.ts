import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

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

/** Snapshot of `plans.rate_limit_rpm`, read off production in core#699, 2026-08-30. */
const RPM = { Free: 30, Pro: 120, Enterprise: 300 } as const;

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
