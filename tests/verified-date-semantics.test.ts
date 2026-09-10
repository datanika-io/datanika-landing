/**
 * `verified_date` is a field with no consumer, no constraint, and a name that
 * promises more than it delivers.
 *
 * ## What was measured (2026-09-10)
 *
 * | | |
 * |---|---|
 * | connector guides | 37 |
 * | `verified_date` older than the guide's own last commit | **34** |
 * | guides where the field is rendered to a reader | **0** |
 * | tests or schema rules constraining it, before this file | **0** |
 *
 * 🔑 **The staleness is caused by diligence, not neglect.** Every correct fix
 * shipped to these guides — the #502 Test-Connection sweep, the Kafka auth
 * correction, the phantom-nav pass — edits the body and leaves `verified_date`
 * alone. The better the corpus is maintained, the more of these go stale.
 *
 * ## Why this file asserts documentation rather than dates
 *
 * The obvious guard — *"`verified_date` must not predate the last body change"* —
 * is wrong, and would do damage. It would fail on every typo fix, and the cheapest
 * way to make it pass is to bump the date, which asserts a verification that never
 * happened. **A stale record traded for a false one is not an improvement.**
 *
 * So the defect here is not a wrong value. It is that there was **no criterion at
 * all**: with nothing stating what the field means, 34-of-37 cannot be judged
 * right or wrong. This file supplies the criterion where a reader meets it — at
 * the declaration — and then keeps it there.
 *
 * ⚠️ That is the same failure mode found in `_template.md` on 2026-09-09: the
 * guidance block could be deleted with the whole suite green, because the only
 * affirmative assertion was pinned to an unrelated token. An explanation nothing
 * guards is an explanation with a deletion date.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const SCHEMA = resolve(ROOT, "src/content.config.ts");
const GUIDES = resolve(ROOT, "src/content/connectors");

describe("verified_date carries its own semantics at the declaration", () => {
  const schema = () => readFileSync(SCHEMA, "utf-8");

  it("the fields still exist, or this guard is describing something gone", () => {
    const s = schema();
    expect(s).toMatch(/verified_by:\s*z\./);
    expect(s).toMatch(/verified_date:\s*z\./);
  });

  it("the declaration explains what verified_date does and does not mean", () => {
    const s = schema();
    // Each needle is a distinct load-bearing statement, not a synonym.
    const REQUIRED: Array<[RegExp, string]> = [
      [/WHEN SOMEONE FIRST LOOKED/i, "says what the field records"],
      [/does NOT mean\s*\n?\s*\*?\s*the guide is accurate today/i, "says what it does not mean"],
      [/Do not "fix" this by bumping the date/i, "forbids the repair that would make it lie"],
      [/draft-pending-verification/, "explains the unverified state"],
    ];
    const missing = REQUIRED.filter(([re]) => !re.test(s)).map(([, why]) => why);
    expect(
      missing,
      "src/content.config.ts no longer " + missing.join("; and no longer ") +
        ". This field looks like a control and is not one; without the note at the " +
        "declaration, the next reader infers a verification process that runs.",
    ).toEqual([]);
  });

  /**
   * Anti-vacuity: the corpus this was derived against must still be there, and
   * the field must still be in use. A guard whose subject has vanished passes
   * for the wrong reason.
   */
  it("the corpus it was derived against is still present and still uses the field", () => {
    const guides = readdirSync(GUIDES).filter((f) => f.endsWith(".md"));
    expect(guides.length, `expected the connector guide corpus in ${GUIDES}`).toBeGreaterThan(30);

    const withField = guides.filter((f) =>
      /verified_date:/.test(readFileSync(resolve(GUIDES, f), "utf-8")),
    );
    expect(
      withField.length,
      "no guide declares verified_date any more — if the field was removed, delete " +
        "this guard and the note rather than leaving both describing nothing.",
    ).toBeGreaterThan(30);
  });

  it("the needle matcher is not inert", () => {
    expect(/WHEN SOMEONE FIRST LOOKED/i.test("nothing of the sort here")).toBe(false);
    expect(/WHEN SOMEONE FIRST LOOKED/i.test(schema())).toBe(true);
  });
});
