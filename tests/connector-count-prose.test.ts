/**
 * Guardrail: the connector count written in PROSE must match `connectors.ts`.
 *
 * Why this exists. Two guards already watch the connector count and both were
 * blind to this:
 *
 *   - `connector-count-parity.yml` compares `src/data/connectors.ts` against
 *     core's README. It watches the *data file*.
 *   - `connectors.test.ts` derives every connector page from the data file, so
 *     the generated pages can never drift.
 *
 * Neither looks at the sentence "we have 32 connectors" typed into a marketing
 * page. On 2026-08-30 that sentence was live in **eight** places while
 * `/connectors/` rendered 36 — including on `/why-cheaper/`, and inside a
 * "View all 32 connectors" link pointing straight at the page that said 36.
 * The build was green throughout, exactly like it was green over the 25 wrong
 * connector config tables the field-parity script later found.
 *
 * Rule enforced: a bare "<N> connectors" in prose must equal the live count.
 *
 * Deliberately NOT matched:
 *   - "700+ connectors" / "600+ connectors" — a `+` breaks the digit-space
 *     adjacency, so competitor counts are out of scope by construction. They
 *     are third-party claims with their own sourcing discipline, not ours.
 *   - Date-stamped historical narrative, which is a true statement about a past
 *     moment. Those go in ALLOWED below **with a reason**, and the reason has
 *     to be "this sentence is about the past", never "this one is annoying".
 *   - Counts below MIN_CATALOGUE_CLAIM. "Phase A: 4 connectors" and "Tier 1
 *     connectors" are subset counts and a stray regex hit respectively; both
 *     showed up on the first run of this test and neither is a claim about the
 *     catalogue. A catalogue claim is a two-digit number by construction.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, extname, relative } from "path";
import { connectors } from "../src/data/connectors";

const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["src/pages", "src/content", "src/components", "src/layouts"];
const SCAN_EXT = new Set([".astro", ".md", ".mdx"]);

/**
 * A bare count: digits, a single space, then "connector"/"connectors".
 * The negative lookbehind keeps us off "1,032 connectors" style fragments and,
 * critically, off "700+ connectors" (the `+` sits between digits and space).
 */
const COUNT_RE = /(?<![\w.$+,])(\d{1,4}) connectors?\b/gi;

/**
 * Below this, "<N> connectors" is describing a subset ("Phase A: 4 connectors"),
 * or is a stray hit like "Tier 1 connectors" — not a claim about the catalogue.
 * Both showed up on this test's first run. A catalogue claim is a two-digit
 * number by construction; raise this only if the catalogue ever gets that small.
 */
const MIN_CATALOGUE_CLAIM = 20;

type Allowed = { file: string; text: string; reason: string };

const ALLOWED: Allowed[] = [
  {
    file: "src/content/blog/32-connectors-most-took-a-day.md",
    text: "32 Connectors",
    reason:
      "Post title and slug. A dated claim about how many connectors existed when it was written; " +
      "the slug is a live URL and renaming it would 301 away an indexed page.",
  },
  {
    file: "src/content/blog/dbt-per-tenant.md",
    text: "32 connectors",
    reason: "Cites the post above by its title. Changing it would misname a real page.",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(extname(entry))) out.push(full);
  }
  return out;
}

function isAllowed(file: string, text: string): boolean {
  return ALLOWED.some((a) => a.file === file && a.text === text);
}

describe("connector count in prose matches src/data/connectors.ts", () => {
  const expected = connectors.length;

  const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

  it("scans a non-trivial number of files (guards against a broken walk)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it(`every bare "<N> connectors" equals ${expected}`, () => {
    const violations: string[] = [];

    for (const full of files) {
      const rel = relative(ROOT, full).split("\\").join("/");
      const text = readFileSync(full, "utf-8");
      for (const match of text.matchAll(COUNT_RE)) {
        const n = Number(match[1]);
        if (n === expected) continue;
        if (n < MIN_CATALOGUE_CLAIM) continue;
        if (isAllowed(rel, match[0])) continue;
        const line = text.slice(0, match.index).split("\n").length;
        violations.push(
          `${rel}:${line} says "${match[0]}" but connectors.ts has ${expected}`
        );
      }
    }

    expect(
      violations,
      "Connector count drifted in prose. Either update the copy, or — if the " +
        "sentence is deliberately about a past moment — add it to ALLOWED in " +
        "this file with a reason.\n" +
        violations.join("\n")
    ).toEqual([]);
  });

  it("every ALLOWED entry still matches something (no stale exemptions)", () => {
    const stale = ALLOWED.filter((a) => {
      const full = resolve(ROOT, a.file);
      let body: string;
      try {
        body = readFileSync(full, "utf-8");
      } catch {
        return true;
      }
      return !body.includes(a.text);
    });
    expect(
      stale,
      `Stale exemptions in ALLOWED — the text is gone, so the entry should be too: ${JSON.stringify(stale)}`
    ).toEqual([]);
  });
});
