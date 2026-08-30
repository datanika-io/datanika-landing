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
import { connectors, sourceConnectors, destinationConnectors } from "../src/data/connectors";

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

/**
 * The same defect one layer down (#376).
 *
 * `connector-count-prose.test.ts` above matches `<N> connectors` and nothing
 * else. Two live sentences paired a **derived** total with a **hardcoded**
 * split five words apart — `/docs/getting-started` rendered *"36 connectors (30
 * sources and 11 destinations)"* — so the guarded half was right, the unguarded
 * half was wrong, 30 + 11 = 41, and the suite was green throughout.
 *
 * Both figures are fossils with a traceable origin: #291 withdrew Google Ads and
 * moved the site's source count 31 → 30; #294 restored the connector six weeks
 * later and every **derived** number reverted itself, while four hand-written
 * strings stayed at whichever value was current when each was typed.
 *
 * ## What the data actually says
 *
 * 36 entries — 25 `source`, 11 `both`, **0 `destination`**. There are no
 * destination-only connectors, so the two sets overlap: **36 source-capable, 11
 * destination-capable**, and they do not sum to the catalogue. Any sentence
 * pairing the halves has to survive that, which is why the fixed copy says the
 * destinations are *also* sources rather than putting two integers side by side
 * and inviting the reader to add them.
 */
describe("source/destination split in prose matches src/data/connectors.ts (#376)", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

  /**
   * A count attached to "sources" / "destinations", tolerating a short bridge
   * so the copy can read like English: *"all 36 work as sources"*, *"11 of them
   * also work as destinations"*.
   *
   * ⚠️ The bridge is an **explicit word list**, not a wildcard, and that is the
   * whole design. The first draft used `[^.\d]{0,30}?` and produced 37
   * violations, of which 30 were noise — Tailwind class numbers
   * (`text-slate-400">source`), the phrase "open source", a `| Source |` table
   * header, and `-d @source` inside a curl example. A guard that fires on thirty
   * correct things gets deleted, and takes the seven real ones with it.
   *
   * Plural only, for the same reason: "a source", "as a source" and "open
   * source" are not catalogue claims.
   */
  const BRIDGE = "(?:\\s+(?:of|them|also|work|works|as|which|are|is|and|the|both|usable|act|can))*";
  const SOURCES_RE = new RegExp(`\\b(\\d{2,4})(${BRIDGE})\\s+(?:data\\s+)?sources\\b`, "gi");
  const DESTS_RE = new RegExp(`\\b(\\d{2,4})(${BRIDGE})\\s+destinations\\b`, "gi");

  /**
   * Exemptions are for sentences that are **not about our catalogue**, or are
   * deliberately about a past moment. Never for "this one is annoying".
   */
  const SPLIT_ALLOWED: Allowed[] = [
    {
      file: "src/content/blog/32-connectors-most-took-a-day.md",
      text: "27 sources",
      reason:
        "Dated narrative: 32 connectors as they stood when the post was written. Already " +
        "exempted for the total above, for the same reason.",
    },
    {
      file: "src/content/blog/real-cost-modern-data-stack.md",
      text: "10 sources",
      reason:
        "A hypothetical customer's stack profile ('10 sources, 10M rows/mo'), not our " +
        "catalogue. Appears twice; the post names no destination count at all.",
    },
    {
      file: "src/content/blog/datanika-vs-modern-data-stack.md",
      text: "15 sources",
      reason:
        "The tail of '8–15 sources' — the reader's own stack size in the 'keep Fivetran' " +
        "paragraph, not our catalogue.",
    },
  ];

  function splitAllowed(file: string, text: string): boolean {
    return SPLIT_ALLOWED.some((a) => a.file === file && a.text === text);
  }

  it(`every source count in a split reads ${sourceConnectors.length}, every destination count ${destinationConnectors.length}`, () => {
    const violations: string[] = [];

    for (const full of files) {
      const rel = relative(ROOT, full).split("\\").join("/");
      const body = readFileSync(full, "utf-8");

      const check = (re: RegExp, expected: number, noun: string) => {
        for (const m of body.matchAll(re)) {
          const n = Number(m[1]);
          if (n === expected) continue;
          const quoted = m[0].replace(/\s+/g, " ").trim();
          if (splitAllowed(rel, quoted)) continue;
          const line = body.slice(0, m.index).split("\n").length;
          violations.push(
            `${rel}:${line} says "${m[0].replace(/\s+/g, " ")}" but connectors.ts has ${expected} ${noun}-capable`,
          );
        }
      };

      check(SOURCES_RE, sourceConnectors.length, "source");
      check(DESTS_RE, destinationConnectors.length, "destination");
    }

    expect(
      violations,
      "The source/destination split drifted. Derive it — `sourceConnectors.length` and " +
        "`destinationConnectors.length` are exported from src/data/connectors.ts — or, if the " +
        "sentence is not about our catalogue, add it to SPLIT_ALLOWED with a reason.\n" +
        violations.join("\n"),
    ).toEqual([]);
  });

  /**
   * 🚨 This assertion started life as `toBe(0)` — "there are no destination-only
   * connectors, so all 36 work as sources" — derived from this data file alone
   * and written into four pages before anyone checked it against the product.
   *
   * Core disagrees, by name, in its own test suite
   * (`tests/test_services/test_connection_service.py`):
   *
   *     assert infer_direction("bigquery")  == ConnectionDirection.DESTINATION
   *     assert infer_direction("snowflake") == ConnectionDirection.DESTINATION
   *     assert infer_direction("redshift")  == ConnectionDirection.DESTINATION
   *
   * `SOURCE_TYPES` in `connection_service.py` contains none of the five cloud
   * warehouses, and `dlt_runner.SUPPORTED_SOURCE_TYPES` is the seven SQL
   * databases only. So the catalogue is **25 source-only + 6 both + 5
   * destination-only**, and the capability sets overlap by 6 rather than 11 (#391).
   *
   * `connector-count-parity.yml` compares the connector *count* against core's
   * README and is structurally blind to `direction`, which is why this sat
   * unnoticed. Changing these five slugs means the product changed — go read
   * core, not this file.
   */
  const DESTINATION_ONLY = ["bigquery", "snowflake", "redshift", "databricks", "synapse"];

  it("the five cloud warehouses are destination-only, as core asserts by name", () => {
    expect(
      connectors.filter((c) => c.direction === "destination").map((c) => c.slug).sort(),
    ).toEqual([...DESTINATION_ONLY].sort());
  });

  it("the three capability sets partition the catalogue", () => {
    const only = (d: string) => connectors.filter((c) => c.direction === d).length;
    expect(only("source") + only("both") + only("destination")).toBe(connectors.length);
    expect(sourceConnectors.length).toBe(only("source") + only("both"));
    expect(destinationConnectors.length).toBe(only("destination") + only("both"));
    // The overlap is real and is why the two halves must never be summed in prose.
    expect(sourceConnectors.length + destinationConnectors.length).toBeGreaterThan(
      connectors.length,
    );
  });

  it("no connector marked a destination still advertises extraction", () => {
    const offenders: string[] = [];
    for (const c of connectors.filter((x) => x.direction === "destination")) {
      const prose = [c.description, ...c.useCases].join(" | ");
      const claim = /\bextract\w*|\bas a source\b|\bor a source\b/i;
      if (claim.test(prose)) offenders.push(`${c.slug}: ${prose}`);
    }
    expect(
      offenders,
      "A destination-only connector's copy promises extraction. Core cannot extract from it.",
    ).toEqual([]);
  });

  it("every SPLIT_ALLOWED entry still matches something (no stale exemptions)", () => {
    const stale = SPLIT_ALLOWED.filter((a) => {
      try {
        return !readFileSync(resolve(ROOT, a.file), "utf-8").includes(a.text);
      } catch {
        return true;
      }
    });
    expect(stale, `Stale SPLIT_ALLOWED: ${JSON.stringify(stale)}`).toEqual([]);
  });
});
