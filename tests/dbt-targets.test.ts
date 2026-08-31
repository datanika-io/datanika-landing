/**
 * Which destinations dbt can build models in — landing#427, landing#428,
 * core#825, core#862.
 *
 * ## What this file can and cannot prove
 *
 * It CANNOT prove that a connector is a dbt target. That fact lives in the core
 * image's installed adapter set, and this repo has no view of it. Pretending
 * otherwise is precisely the failure this suite exists because of: a claim
 * bound to landing's own belief produces a coherent, machine-readable assertion
 * of something untrue, and a self-consistency guard goes green on all of it
 * (landing#391).
 *
 * What it CAN do, and what `legal-pages-facts.test.ts` established the pattern
 * for: keep retired claims from creeping back, and keep the surfaces agreeing
 * with each other. The binding to production is the provenance comment on
 * `transformationDestinationConnectors` in `src/data/connectors.ts` — measured
 * with `importlib.util.find_spec` against the core venv, with a date and a
 * re-derivation instruction. A human re-measures; this file notices drift.
 *
 * ## The two directions, and both matter
 *
 * Overstating ("dbt runs against MySQL") sends a user into
 * `DbtProjectError: Unsupported dbt adapter: mysql` on a run that has already
 * consumed quota. Understating ("MySQL is no longer supported") scares them off
 * extraction and loading, which work perfectly. A check for only the first
 * direction is satisfied by deleting MySQL from the site.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  connectors,
  destinationConnectors,
  transformationDestinationConnectors,
} from "../src/data/connectors";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

/** Destinations dlt can load into but dbt cannot build in. core#825, core#862. */
const LOAD_ONLY_SLUGS = ["mysql", "sqlite", "databricks", "synapse"];

describe("the dbt target set is a strict subset of the destination set", () => {
  it("every dbt target is also a destination", () => {
    const destSlugs = new Set(destinationConnectors.map((c) => c.slug));
    for (const c of transformationDestinationConnectors) {
      expect(destSlugs.has(c.slug), `${c.slug} is a dbt target but not a destination`).toBe(true);
    }
  });

  it("is a STRICT subset — the two sets are not the same thing", () => {
    // If these ever became equal, the /docs/architecture sentence this work
    // retired ("the dbt transformation layer runs against the same
    // destination") would become true and this suite would be pointless. It is
    // far more likely that someone re-derived the dbt list from `direction`.
    expect(transformationDestinationConnectors.length).toBeLessThan(
      destinationConnectors.length,
    );
  });

  it("no load-only destination is listed as a dbt target", () => {
    const dbtSlugs = new Set(transformationDestinationConnectors.map((c) => c.slug));
    for (const slug of LOAD_ONLY_SLUGS) {
      expect(dbtSlugs.has(slug), `${slug} is listed as a dbt target; it is load-only`).toBe(false);
    }
  });

  it("every load-only slug is a real connector, so a rename cannot silently disarm this file", () => {
    // A guard keyed on a slug that no longer exists passes vacuously. That is
    // how a check stops being able to fail without anyone noticing.
    const all = new Set(connectors.map((c) => c.slug));
    for (const slug of LOAD_ONLY_SLUGS) {
      expect(all.has(slug), `LOAD_ONLY_SLUGS names "${slug}", which is not in connectors.ts`).toBe(
        true,
      );
    }
  });

  it("PostgreSQL is a dbt target — it is the one used in every example on the site", () => {
    // The previous category filter omitted it for months while /docs/pipelines
    // showed "Destination: Postgres -> Analytics DB" as the worked example.
    const dbtSlugs = transformationDestinationConnectors.map((c) => c.slug);
    expect(dbtSlugs).toContain("postgresql");
  });
});

describe("every load-only destination says so on its own connector page", () => {
  it.each(LOAD_ONLY_SLUGS)("%s carries a limitation citing a tracking issue", (slug) => {
    const c = connectors.find((x) => x.slug === slug)!;
    expect(c.limitations ?? [], `${slug} has no limitations entry`).toEqual(
      expect.arrayContaining([expect.stringMatching(/transformation target/i)]),
    );
    expect((c.limitations ?? []).join(" ")).toMatch(/core#\d+/);
  });

  it.each(LOAD_ONLY_SLUGS)("%s renders the limitation in the built page", (slug) => {
    const html = readHtml(`connectors/${slug}/index.html`);
    expect(html).toContain("Current limitations");
    expect(html).toMatch(/transformation target/i);
  });

  it.each(LOAD_ONLY_SLUGS)("%s never advertises running dbt against itself", (slug) => {
    const c = connectors.find((x) => x.slug === slug)!;
    // useCases and seoDescription are the two places this was written as a
    // selling point: "Run dbt transformations on Synapse" was a bullet on the
    // Synapse page, and "Built-in dbt transforms" was in two meta descriptions.
    const sell = [...c.useCases, c.seoDescription ?? "", c.description].join(" | ");
    for (const re of [
      /run dbt transformations on/i,
      /built-in dbt transforms/i,
      /dbt transforms built in/i,
      /architecture with dlt \+ dbt/i,
    ]) {
      expect(re.test(sell), `${slug} sells dbt-on-${slug} via ${re}`).toBe(false);
    }
  });
});

describe("MySQL is not over-corrected — the capabilities that still ship still say so", () => {
  const guide = () => read("../src/content/connectors/mysql.md");

  it("the data file still describes MySQL as a source and a destination", () => {
    const mysql = connectors.find((c) => c.slug === "mysql")!;
    expect(mysql.direction).toBe("both");
    expect(mysql.description).toMatch(/source or destination/i);
  });

  it("the guide still says MySQL works as a load destination", () => {
    expect(guide()).toMatch(/load data \*into\* MySQL/i);
  });

  it("the guide never says MySQL is unsupported", () => {
    for (const re of [
      /MySQL is no longer supported/i,
      /MySQL support has been removed/i,
      /we no longer support MySQL/i,
    ]) {
      expect(re.test(guide()), `mysql.md matched ${re} — MySQL still works as a source and a load destination`).toBe(false);
    }
  });

  it("the built MySQL connector page still carries the Source & Destination badge", () => {
    const html = readHtml("connectors/mysql/index.html");
    expect(html).toMatch(/Source &amp; Destination/);
  });
});

describe("retired claims do not creep back", () => {
  /** Every one of these was live on datanika.io on 2026-08-31. */
  const RETIRED: Array<[string, string, RegExp]> = [
    [
      "architecture asserted the load set and the dbt set were identical",
      "../src/pages/docs/architecture.astro",
      /dbt transformation layer runs against the same destination/i,
    ],
    [
      "transformations claimed dbt ran against everything it listed",
      "../src/pages/docs/transformations.astro",
      /Datanika runs dbt against any of these destinations/i,
    ],
    [
      "the MySQL guide told the reader to pick MySQL as a pipeline destination",
      "../src/content/connectors/mysql.md",
      /select MySQL as the destination when configuring a pipeline/i,
    ],
    [
      "the SQLite guide claimed dbt-on-SQLite works",
      "../src/content/connectors/sqlite.md",
      /dbt-on-SQLite works/i,
    ],
    [
      "the Databricks guide offered Databricks-specific materializations",
      "../src/content/connectors/databricks.md",
      /Databricks-specific materializations/i,
    ],
    [
      "the Synapse guide offered Synapse-specific materializations",
      "../src/content/connectors/synapse.md",
      /Synapse-specific materializations/i,
    ],
  ];

  /**
   * Source comments are stripped before matching, and that is load-bearing.
   *
   * `architecture.astro` deliberately QUOTES the retired sentence in a comment
   * explaining why it was retired — which is exactly what a future reader
   * should find, and exactly what a naive whole-file regex flags. This suite
   * originally passed on that file **only because the quote happens to wrap
   * across a line break in the middle of the matched phrase.** Reflowing a
   * comment would have turned the guard red for a file that is correct, and a
   * guard whose verdict depends on where a comment wraps is not measuring what
   * it claims to. Markdown is left alone: it has no comment syntax here and `*`
   * is a list marker.
   */
  const stripComments = (rel: string, src: string) =>
    rel.endsWith(".md")
      ? src
      : src
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .join("\n");

  it.each(RETIRED)("%s", (_label, rel, re) => {
    expect(re.test(stripComments(rel, read(rel))), `${rel} still matches ${re}`).toBe(false);
  });

  it("the comment stripper strips — it must not silently become a no-op", () => {
    // Two-directional control. If `stripComments` degraded to identity the
    // second assertion fails; if someone deleted the explanatory comment the
    // first does. Without this, "no match" is satisfied by a stripper that
    // removed the whole file.
    const rel = "../src/pages/docs/architecture.astro";
    const raw = read(rel);
    const re = /transformation layer runs against the same destination/;
    expect(re.test(raw), "architecture.astro no longer explains what it retired").toBe(true);
    expect(re.test(stripComments(rel, raw)), "stripComments is a no-op").toBe(false);
    // And it must not have eaten the live copy along with the comment.
    expect(stripComments(rel, raw)).toMatch(/covers most of them but not all/);
  });

  it("the matchers fire on the copy they retired", () => {
    // The negative control. Without it every assertion above is satisfied by a
    // regex that matches nothing — a checker with one possible answer, which is
    // this project's signature defect. Each string below is the real retired
    // text, not a fixture written to agree with the matcher.
    const samples: Array<[RegExp, string]> = [
      [
        RETIRED[0][2],
        "Datanika's load layer (dlt) can write to any of these. The dbt transformation layer runs against the same destination. All are computed dynamically from the connectors data file",
      ],
      [
        RETIRED[1][2],
        "Datanika runs dbt against any of these destinations. Each supports materialized models (table, view, incremental) and the full dbt macro set.",
      ],
      [
        RETIRED[2][2],
        "If you're loading data *into* MySQL, the same connection works — just select MySQL as the destination when configuring a pipeline.",
      ],
      [
        RETIRED[3][2],
        "**Transformations:** dbt-on-SQLite works for small projects via `dbt-sqlite`, but most users load SQLite into a bigger warehouse first and transform there.",
      ],
      [
        RETIRED[4][2],
        "- **dbt tips:** Databricks-specific materializations (Delta, liquid clustering) in the [Transformations guide](/docs/transformations-guide)",
      ],
      [
        RETIRED[5][2],
        "- **dbt tips:** Synapse-specific materializations in the [Transformations guide](/docs/transformations-guide)",
      ],
    ];
    expect(samples.length).toBe(RETIRED.length);
    for (const [re, sample] of samples) {
      expect(re.test(sample), `matcher ${re} does not catch its own retired copy`).toBe(true);
    }
  });
});

describe("the replacement claim is actually rendered, not merely absent", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/transformations/index.html");
  });

  it("names the load-only destinations and says they cannot be transformation targets", () => {
    expect(html).toMatch(/MySQL, SQLite, Databricks and Synapse/);
    expect(html).toMatch(/cannot be a transformation target/i);
  });

  it("says they DO accept loaded data, so the page is not read as a withdrawal", () => {
    expect(html).toMatch(/accept loaded data/i);
  });

  it("architecture points at this page instead of restating the set", () => {
    const arch = readHtml("docs/architecture/index.html");
    expect(arch).toContain('href="/docs/transformations"');
    expect(arch).toMatch(/covers most of them but not all/i);
  });
});
