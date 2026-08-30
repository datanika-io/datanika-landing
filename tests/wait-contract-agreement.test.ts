import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * The `?wait=true` outcome contract must say the same thing everywhere we state it.
 *
 * ## Why this test exists
 *
 * `trigger-pipelines-from-ci-cd.md` is a scheduled post: `publishedAt: 2026-09-05`,
 * and `blog-visibility.ts` publishes it on the first build on or after that date.
 * **A timer ships it whether or not anyone has re-read it.**
 *
 * Its original spine was that `?wait=true` returns HTTP 200 for a run that FAILED,
 * so `curl --fail` goes green on a broken pipeline. That was true when written, and
 * writing it is what surfaced the bug (core#663). Engineering then fixed it: a
 * terminal non-success run returns **422**, still-running at the timeout returns
 * **408**, and `curl --fail` became the *correct* idiom rather than the trap.
 *
 * So for six days the repo held a post scheduled to teach, to a timer, the exact
 * inverse of what production does — and to contradict `/api/reference/`, which had
 * already been updated. Nothing in CI could see it: both files built fine, and
 * "the prose is now false" is not a build error.
 *
 * ## What this guards, and what it deliberately does not
 *
 * This is a **cross-file agreement** test, not a correctness test. It cannot reach
 * production and does not know what the API really returns — the same limitation
 * `legal-pages-facts.test.ts` carries. It only guarantees that the post and the
 * reference page cannot drift apart *silently*, and that the specific inversion
 * that already happened cannot come back unnoticed.
 *
 * To re-derive the truth rather than trusting either file:
 *   curl -s https://app.datanika.io/api/v1/openapi.json \
 *     | jq '.paths["/api/v1/pipelines/{id}/run"].post.responses'
 * That live document is the source Infra gated the docs merge on.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

const POST = "../src/content/blog/trigger-pipelines-from-ci-cd.md";
const REFERENCE = "../src/pages/api/reference.astro";

describe("?wait=true outcome contract is stated consistently", () => {
  /**
   * The retired claim, in the shapes it actually took. Each of these asserts
   * 200-means-finished-not-succeeded, which is the inversion core#663 fixed.
   *
   * ⚠️ Matching the *instruction*, not the phrase. The post legitimately still
   * describes the old behaviour in its "the trap this replaced" section — that
   * is history, correctly labelled, and must stay readable. These patterns are
   * written to catch the old behaviour asserted as CURRENT, which is why none
   * of them is a bare search for "200".
   */
  const RETIRED_CLAIMS: Array<[RegExp, string]> = [
    [/All three come back as \*\*HTTP 200/i, "the original spine sentence"],
    [/goes green on a failed pipeline/i, "the WRONG-labelled curl example"],
    [/Check the field, not the status code/i, "the jq workaround heading"],
    [
      /\*\*200\*\* [—-] the run reached a terminal state/i,
      "the wait-mode bullet that folded failure into 200",
    ],
  ];

  it.each(RETIRED_CLAIMS)(
    "the post does not re-assert %s as current behaviour",
    (re, _label) => {
      const src = read(POST);
      expect(
        re.test(src),
        `The CI/CD post matched ${re}, which asserts the pre-core#663 contract ` +
          `as if it were current. ?wait=true now returns 200 only on success, ` +
          `408 while still running, and 422 for a terminal non-success. ` +
          `Re-derive before changing this test: ` +
          `curl -s https://app.datanika.io/api/v1/openapi.json | jq ` +
          `'.paths["/api/v1/pipelines/{id}/run"].post.responses'`,
      ).toBe(false);
    },
  );

  /**
   * The positive half. An absence-only check cannot tell a corrected post from
   * a deleted section — and deleting the section would leave a reader with no
   * account of what the status codes mean at all.
   */
  it.each([
    ["408", /408/],
    ["422", /422/],
  ])("the post names %s", (_label, re) => {
    expect(
      re.test(read(POST)),
      `The CI/CD post no longer mentions this status code. Both are load-bearing: ` +
        `422 is "your pipeline failed" and 408 is "still running, not a failure", ` +
        `and the whole point of the rewrite is that those need different remedies.`,
    ).toBe(true);
  });

  it("the post and /api/reference agree on which code means a failed run", () => {
    const post = read(POST);
    const reference = read(REFERENCE);

    // This is the pairing that actually broke: the reference page was updated
    // for core#663 while the post still taught the pre-fix behaviour, so the
    // site would have contradicted itself on 2026-09-05.
    for (const [label, src] of [
      ["post", post],
      ["reference", reference],
    ] as const) {
      expect(
        /422/.test(src),
        `${label} does not mention 422. If the API contract genuinely changed, ` +
          `update BOTH files in the same commit — that they disagreed for six ` +
          `days, silently, is why this test exists.`,
      ).toBe(true);
      expect(
        /408/.test(src),
        `${label} does not mention 408. Same rule: update both together.`,
      ).toBe(true);
    }
  });
});

/**
 * `POST /api/v1/runs/{id}/cancel` returns 200 and does not cancel anything
 * (core#657, OPEN): it writes `status = CANCELLED` to the row, never revokes the
 * Celery task, and `complete_run` then overwrites the status back to SUCCESS.
 *
 * The post's original cleanup step told readers to call it from an `if: cancelled()`
 * job — i.e. it would have manufactured exactly the API callers core#657 warns
 * about, at tutorial scale. It now documents the limitation instead.
 *
 * **When core#657 ships, this section needs the reverse edit** and this test will
 * fail loudly to demand it, which is the point. Do not delete the citation to make
 * the test pass — rewrite the section, then the test.
 *
 * Note the endpoint is absent from the live openapi.json (which documents only
 * GET /runs/{id} and GET /runs/{id}/logs), so the OpenAPI document alone would not
 * have surfaced this. It needed the route handlers:
 *   gh api "repos/datanika-io/datanika-core/contents/datanika/services/api_v1_routes.py?ref=master"
 */
describe("run cancellation is documented as it actually ships", () => {
  it("the post does not present cancellation as working", () => {
    const src = read(POST);
    expect(
      /Cancel the run if the job is cancelled/i.test(src),
      `The CI/CD post has restored the "if: cancelled()" cleanup step that calls ` +
        `POST /api/v1/runs/{id}/cancel as though it stops the run. It does not ` +
        `(core#657): the worker continues and overwrites the status back to ` +
        `success, so the reader is told work stopped that is still running — and ` +
        `on usage-based plans, still metering.`,
    ).toBe(false);
  });

  it("the post cites core#657 and says what to do instead", () => {
    const src = read(POST);
    expect(src, "The CI/CD post no longer cites core#657").toContain("core#657");
    expect(
      /keeps metering|still metering/i.test(src),
      `The CI/CD post no longer states the billing consequence of a cancellation ` +
        `that does not stop work. That is the concrete reason a reader should care; ` +
        `without it the limitation reads as pedantry and gets skimmed.`,
    ).toBe(true);
  });
});
